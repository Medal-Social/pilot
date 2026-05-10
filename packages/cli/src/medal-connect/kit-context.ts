// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { addApp, removeApp } from '@medalsocial/kit/commands/apps';
import { errorCodes, PilotError } from '../errors.js';
import { type Exec, realExec } from '../shell/exec.js';

export interface KitContext {
  kitRepoDir: string;
  user: string;
  machineType: 'darwin' | 'nixos' | string;
  runRebuild: () => Promise<{ ok: boolean; durationMs: number; error?: string }>;
  addCask: (cask: string) => Promise<void>;
  removeCask: (cask: string) => Promise<void>;
  commitAndPush: (message: string) => Promise<void>;
}

export interface ResolveOptions {
  /**
   * Optional explicit kit.config.json path. When omitted, we use the kit
   * package's own resolution rules (`KIT_CONFIG` env > standard candidate
   * locations) so Medal Connect picks up the same config the standalone kit
   * commands already use — no second source of truth.
   */
  kitConfigPath?: string;
  machineId: string;
  /**
   * Subprocess execution interface. Defaulted to `realExec` so production
   * uses the canonical Pilot Exec abstraction (per the repo rule that all
   * `child_process` usage flow through `packages/cli/src/shell/exec.ts`).
   * Tests inject a fake to assert which commands were spawned.
   */
  exec?: Exec;
}

interface KitConfigRaw {
  machines?: Record<string, { type: string; user: string }>;
  gitStrategy?: string;
  repoDir?: string;
}

/**
 * Returns the resolved kit.config.json path, using the same resolution rules
 * as the standalone kit commands. Returns the first existing candidate so
 * Medal Connect and `pilot kit ...` always agree on which file is canonical.
 *
 * Falls back to the first candidate even when nothing exists, so the caller
 * can produce a "config not found at <X>" error pointing at the conventional
 * location rather than a synthetic placeholder.
 */
export async function getKitConfigPath(): Promise<string> {
  const { configCandidates } = await import('@medalsocial/kit');
  const candidates = configCandidates();
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0] ?? join(process.env.HOME ?? '~', 'Documents/Code/kit/kit.config.json');
}

/**
 * Reads kit.config.json, locates the machine entry, and wires the four
 * `MedalConnectKitProvider` deps (`runRebuild`/`addCask`/`removeCask`/
 * `commitAndPush`) to the underlying kit primitives.
 *
 * - `runRebuild` shells out to `darwin-rebuild` or `nixos-rebuild` per the
 *   machine type. `sudo` is invoked the same way the standalone kit command
 *   already does — Medal Connect does NOT introduce a new privilege boundary
 *   (spec §11; standards/security/secrets-and-credentials.md).
 * - `addCask`/`removeCask` patch `apps/apps.json` via the kit primitives.
 * - `commitAndPush` honors the `gitStrategy: 'none'` opt-out so machines that
 *   manage their own commits don't get double-committed.
 */
export async function resolveKitContext(opts: ResolveOptions): Promise<KitContext> {
  const exec = opts.exec ?? realExec;
  const kitConfigPath = opts.kitConfigPath ?? (await getKitConfigPath());
  if (!existsSync(kitConfigPath)) {
    throw new PilotError(errorCodes.CONNECT_KIT_CONFIG_NOT_FOUND, kitConfigPath);
  }
  const config = JSON.parse(readFileSync(kitConfigPath, 'utf8')) as KitConfigRaw;
  const machine = config.machines?.[opts.machineId];
  if (!machine) {
    throw new PilotError(errorCodes.CONNECT_KIT_MACHINE_NOT_IN_CONFIG, opts.machineId);
  }
  // Match the kit loader's repoDir derivation: explicit `repoDir` (with `~`
  // expansion + relative-to-config resolution) wins, otherwise fall back to
  // the directory of the config file itself.
  const kitRepoDir = config.repoDir
    ? resolveRepoDir(config.repoDir, kitConfigPath)
    : dirname(kitConfigPath);
  const machineType = machine.type;

  return {
    kitRepoDir,
    user: machine.user,
    machineType,
    runRebuild: async () => {
      const start = Date.now();
      const cmd = machineType === 'darwin' ? 'darwin-rebuild' : 'nixos-rebuild';
      const r = await exec.run('sudo', [cmd, 'switch', '--flake', `.#${opts.machineId}`], {
        cwd: kitRepoDir,
      });
      return {
        ok: r.code === 0,
        durationMs: Date.now() - start,
        error: r.code === 0 ? undefined : r.stderr.slice(0, 500),
      };
    },
    addCask: async (cask) => {
      await addApp(join(kitRepoDir, 'apps', 'apps.json'), cask, 'casks');
    },
    removeCask: async (cask) => {
      await removeApp(join(kitRepoDir, 'apps', 'apps.json'), cask, 'casks');
    },
    commitAndPush: async (message) => {
      const skip = config.gitStrategy === 'none';
      if (skip) return;
      const r1 = await exec.run('git', ['add', 'apps/apps.json'], { cwd: kitRepoDir });
      if (r1.code !== 0) return; // nothing staged is fine
      const r2 = await exec.run('git', ['commit', '-m', message], { cwd: kitRepoDir });
      if (r2.code !== 0) return; // nothing to commit is fine
      await exec.run('git', ['push'], { cwd: kitRepoDir });
    },
  };
}

function resolveRepoDir(repoDir: string, configPath: string): string {
  // Expand `~/...` against $HOME to match the kit loader.
  let expanded = repoDir;
  const home = process.env.HOME ?? '';
  if (expanded === '~') expanded = home;
  else if (expanded.startsWith('~/')) expanded = join(home, expanded.slice(2));
  // Treat absolute paths as-is; resolve relative paths against the config dir
  // so the same kit.config.json works on machines with different layouts.
  if (expanded.startsWith('/')) return expanded;
  return join(dirname(configPath), expanded);
}
