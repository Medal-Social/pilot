// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { errorCodes, KitError } from '../errors.js';
import type { FleetProvider } from '../provider/types.js';
import type { Exec } from '../shell/exec.js';
import { rebuildStep } from '../steps/rebuild.js';
import { runSteps } from '../steps/types.js';
import { migrateMachineFile } from './migrate-apps.js';

function findMachineNixFiles(machinesDir: string): Array<{ path: string; machine: string }> {
  const out: Array<{ path: string; machine: string }> = [];
  let entries: string[];
  try {
    entries = readdirSync(machinesDir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(machinesDir, entry);
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      out.push(...findMachineNixFiles(full));
    } else if (stat.isFile() && entry.endsWith('.nix')) {
      out.push({ path: full, machine: basename(entry, '.nix') });
    }
  }
  return out;
}

export async function runMigrations(kitRepoDir: string): Promise<number> {
  let changed = 0;
  for (const { path, machine } of findMachineNixFiles(join(kitRepoDir, 'machines'))) {
    const result = await migrateMachineFile(path, machine);
    if (result.changed) changed += 1;
  }
  return changed;
}

export interface SudoKeeper {
  start(): () => void;
}

export type UpdatePhase = 'auth' | 'pull' | 'policy' | 'migrate' | 'rebuild';

export interface UpdateHooks {
  onPhaseStart?(phase: UpdatePhase, label: string): void;
  onPhaseEnd?(phase: UpdatePhase, label: string, detail?: string): void;
}

export interface RunUpdateOpts {
  machine: string;
  machineType: 'darwin' | 'nixos';
  kitRepoDir: string;
  /** "self" (default) → run git fetch + pull. "none" → skip git ops entirely. */
  gitStrategy?: 'self' | 'none';
  provider: FleetProvider;
  exec: Exec;
  sudoKeeper: SudoKeeper;
  user?: string;
  hooks?: UpdateHooks;
}

async function withPhase<T>(
  hooks: UpdateHooks | undefined,
  phase: UpdatePhase,
  label: string,
  fn: () => Promise<{ value: T; detail?: string }>
): Promise<T> {
  hooks?.onPhaseStart?.(phase, label);
  const { value, detail } = await fn();
  hooks?.onPhaseEnd?.(phase, label, detail);
  return value;
}

export async function runUpdate(opts: RunUpdateOpts): Promise<void> {
  const hooks = opts.hooks;

  await withPhase(hooks, 'auth', 'Authenticating', async () => {
    const r = await opts.exec.run('sudo', ['-v']);
    if (r.code !== 0) throw new KitError(errorCodes.KIT_SUDO_DENIED);
    return { value: undefined, detail: 'sudo cached' };
  });

  if (opts.gitStrategy === 'none') {
    await withPhase(hooks, 'pull', 'Pulling latest config', async () => {
      return { value: undefined, detail: 'skipped (gitStrategy=none)' };
    });
  } else {
    await withPhase(hooks, 'pull', 'Pulling latest config', async () => {
      await opts.exec.run('git', ['-C', opts.kitRepoDir, 'fetch', '--quiet']);
      const behind = await opts.exec.run('git', [
        '-C',
        opts.kitRepoDir,
        'rev-list',
        'HEAD..@{u}',
        '--count',
      ]);
      const count = behind.code === 0 ? Number.parseInt(behind.stdout.trim(), 10) || 0 : 0;
      const pull = await opts.exec.run('git', ['-C', opts.kitRepoDir, 'pull', '--ff-only']);
      if (pull.code !== 0) throw new KitError(errorCodes.KIT_REPO_PULL_FAILED, pull.stderr);
      return {
        value: undefined,
        detail: count > 0 ? `pulled ${count} commit(s)` : 'already up to date',
      };
    });
  }

  await withPhase(hooks, 'policy', 'Checking org policy', async () => {
    const required = await opts.provider.getRequiredApps({
      machineId: opts.machine,
      user: opts.user ?? process.env.USER ?? '',
      kitRepoDir: opts.kitRepoDir,
    });
    const total = required.casks.length + required.brews.length;
    return {
      value: undefined,
      detail:
        total > 0 ? `${total} required (source: ${required.source})` : `none (${required.source})`,
    };
  });

  await withPhase(hooks, 'migrate', 'Migrating apps.json', async () => {
    const changed = await runMigrations(opts.kitRepoDir);
    return {
      value: undefined,
      detail: changed > 0 ? `${changed} machine file(s) updated` : 'no changes',
    };
  });

  const stopKeeper = opts.sudoKeeper.start();
  const onExit = () => stopKeeper();
  process.once('SIGINT', onExit);
  process.once('SIGTERM', onExit);
  try {
    await withPhase(hooks, 'rebuild', 'Rebuilding system', async () => {
      const start = Date.now();
      await runSteps(
        [rebuildStep],
        {},
        {
          exec: opts.exec,
          env: {
            ...process.env,
            KIT_MACHINE: opts.machine,
            KIT_MACHINE_TYPE: opts.machineType,
            KIT_REPO_DIR: opts.kitRepoDir,
          },
        }
      );
      const secs = Math.round((Date.now() - start) / 1000);
      return { value: undefined, detail: `applied in ${secs}s` };
    });
  } finally {
    stopKeeper();
    process.off('SIGINT', onExit);
    process.off('SIGTERM', onExit);
  }
}

export const realSudoKeeper: SudoKeeper = {
  start() {
    const id = setInterval(() => {
      spawn('sudo', ['-v'], { stdio: 'ignore' }).on('error', () => {});
    }, 30_000);
    return () => clearInterval(id);
  },
};
