// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { errorCodes, KitError } from '../errors.js';
import { type KitConfig, kitConfigSchema } from './schema.js';

/** Expand a leading `~` or `~/...` to the user's home directory. */
export function expandTilde(p: string, home: string = homedir()): string {
  if (p === '~') return home;
  if (p.startsWith('~/')) return join(home, p.slice(2));
  return p;
}

export interface LoadOpts {
  env?: NodeJS.ProcessEnv;
  home?: string;
}

export type LoadedKitConfig = KitConfig & {
  /** Resolved kit repo directory — either the explicit `repoDir` or the config file's directory. */
  repoDir: string;
  /** Filesystem path of the kit.config.json that was loaded. */
  configPath: string;
  /** Concrete strategy — defaulted to 'self' when absent in the file. */
  gitStrategy: 'self' | 'none';
};

export function configCandidates(opts: LoadOpts = {}): string[] {
  const env = opts.env ?? process.env;
  // Resolve HOME from the injected env (not process.env) so opts.env is a
  // complete override. opts.home retains highest precedence.
  const home = opts.home ?? env.HOME ?? '';
  const out: string[] = [];
  if (env.KIT_CONFIG) out.push(env.KIT_CONFIG);
  if (home) out.push(join(home, 'Documents', 'Code', 'kit', 'kit.config.json'));
  return out;
}

export async function loadKitConfig(opts: LoadOpts = {}): Promise<LoadedKitConfig> {
  const candidates = configCandidates(opts);

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const raw = await readFile(path, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new KitError(errorCodes.KIT_CONFIG_INVALID, `${path}: ${(e as Error).message}`);
    }
    const result = kitConfigSchema.safeParse(parsed);
    if (!result.success) {
      throw new KitError(errorCodes.KIT_CONFIG_INVALID, `${path}: ${result.error.message}`);
    }
    // Derive repoDir from the config file's location unless explicitly overridden in the file.
    // This makes the same kit.config.json work for any user without editing per-machine paths.
    // If `repoDir` is set, expand `~/...` and resolve relative paths against the config dir.
    let repoDir: string;
    if (result.data.repoDir) {
      const expanded = expandTilde(result.data.repoDir);
      repoDir = isAbsolute(expanded) ? expanded : join(dirname(path), expanded);
    } else {
      repoDir = dirname(path);
    }
    return {
      ...result.data,
      gitStrategy: result.data.gitStrategy ?? 'self',
      repoDir,
      configPath: path,
    };
  }

  throw new KitError(errorCodes.KIT_CONFIG_NOT_FOUND, candidates.join(', '));
}
