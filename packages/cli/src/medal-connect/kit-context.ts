// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { addApp, removeApp } from '@medalsocial/kit/commands/apps';

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
  kitConfigPath: string;
  machineId: string;
}

interface KitConfig {
  machines: Record<string, { type: string; user: string }>;
  gitStrategy?: string;
}

interface RunResult {
  code: number;
  stderr: string;
}

function run(cmd: string, args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => resolve({ code: code ?? 0, stderr }));
    child.on('error', () => resolve({ code: 1, stderr: 'spawn_failed' }));
  });
}

/**
 * Default location for the kit config — `$HOME/.kit/kit.config.json`. The
 * `pilot connect` command uses this when no override is provided. Returning
 * the path lets tests inject a temp directory without touching $HOME.
 */
export function getKitConfigPath(): string {
  return join(process.env.HOME ?? '~', '.kit', 'kit.config.json');
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
  if (!existsSync(opts.kitConfigPath)) {
    throw new Error(`kit.config.json not found at ${opts.kitConfigPath}`);
  }
  const config = JSON.parse(readFileSync(opts.kitConfigPath, 'utf8')) as KitConfig;
  const machine = config.machines[opts.machineId];
  if (!machine) {
    throw new Error(`machine ${opts.machineId} not in kit config`);
  }
  const kitRepoDir = dirname(opts.kitConfigPath);
  const machineType = machine.type;

  return {
    kitRepoDir,
    user: machine.user,
    machineType,
    runRebuild: async () => {
      const start = Date.now();
      const cmd = machineType === 'darwin' ? 'darwin-rebuild' : 'nixos-rebuild';
      const r = await run('sudo', [cmd, 'switch', '--flake', `.#${opts.machineId}`], kitRepoDir);
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
      const r1 = await run('git', ['add', 'apps/apps.json'], kitRepoDir);
      if (r1.code !== 0) return; // nothing staged is fine
      const r2 = await run('git', ['commit', '-m', message], kitRepoDir);
      if (r2.code !== 0) return; // nothing to commit is fine
      await run('git', ['push'], kitRepoDir);
    },
  };
}
