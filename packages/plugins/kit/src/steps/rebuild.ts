// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { errorCodes, KitError } from '../errors.js';
import type { Step, StepContext } from './types.js';

function getMachineType(ctx: StepContext): string {
  const type = ctx.env?.KIT_MACHINE_TYPE;
  if (!type) throw new KitError(errorCodes.KIT_CONFIG_NOT_FOUND, 'KIT_MACHINE_TYPE not set');
  return type;
}

function getMachine(ctx: StepContext): string {
  const machine = ctx.env?.KIT_MACHINE;
  if (!machine) throw new KitError(errorCodes.KIT_CONFIG_NOT_FOUND, 'KIT_MACHINE not set');
  return machine;
}

function getRepoDir(ctx: StepContext): string {
  const dir = ctx.env?.KIT_REPO_DIR;
  if (!dir) throw new KitError(errorCodes.KIT_CONFIG_NOT_FOUND, 'KIT_REPO_DIR not set');
  return dir;
}

/**
 * Resolve a binary's absolute path via `which`. Falls back to the bare name
 * when `which` fails (caller can decide what to do); we use this to feed
 * absolute paths into `sudo`, which strips PATH and otherwise can't find
 * binaries installed under ~/.nix-profile/bin.
 */
async function resolveBin(ctx: StepContext, name: string): Promise<string> {
  const r = await ctx.exec.run('which', [name]);
  const resolved = r.code === 0 ? r.stdout.trim() : '';
  return resolved || name;
}

async function rebuildDarwin(ctx: StepContext, machine: string, repoDir: string): Promise<void> {
  const r = await ctx.exec.run('sudo', ['darwin-rebuild', 'switch', '--flake', `.#${machine}`], {
    cwd: repoDir,
  });
  if (r.code !== 0) throw new KitError(errorCodes.KIT_REBUILD_FAILED, r.stderr);
}

async function rebuildNixos(ctx: StepContext, machine: string, repoDir: string): Promise<void> {
  const r = await ctx.exec.run('sudo', ['nixos-rebuild', 'switch', '--flake', `.#${machine}`], {
    cwd: repoDir,
  });
  if (r.code !== 0) throw new KitError(errorCodes.KIT_REBUILD_FAILED, r.stderr);
}

/**
 * Linux (non-NixOS) rebuild via numtide/system-manager + nix-community/home-manager.
 * Runs as two sequential activations:
 *   1. `sudo system-manager switch --flake .#<machine>` — system layer
 *      (resolved via `which` because sudo strips PATH)
 *   2. `home-manager switch --flake .#<machine>` — user layer
 *      (uses `nix run` if home-manager isn't on PATH yet, e.g. first bootstrap)
 */
async function rebuildLinux(ctx: StepContext, machine: string, repoDir: string): Promise<void> {
  const smBin = await resolveBin(ctx, 'system-manager');
  const sm = await ctx.exec.run('sudo', [smBin, 'switch', '--flake', `.#${machine}`], {
    cwd: repoDir,
  });
  if (sm.code !== 0) throw new KitError(errorCodes.KIT_REBUILD_FAILED, sm.stderr);

  const hmCheck = await ctx.exec.run('which', ['home-manager']);
  const hm =
    hmCheck.code === 0
      ? await ctx.exec.run('home-manager', ['switch', '--flake', `.#${machine}`], { cwd: repoDir })
      : await ctx.exec.run(
          'nix',
          ['run', 'github:nix-community/home-manager', '--', 'switch', '--flake', `.#${machine}`],
          { cwd: repoDir }
        );
  if (hm.code !== 0) throw new KitError(errorCodes.KIT_REBUILD_FAILED, hm.stderr);
}

export const rebuildStep: Step = {
  id: 'rebuild',
  label: 'Rebuild',
  async check() {
    return false;
  },
  async run(ctx) {
    const type = getMachineType(ctx);
    const machine = getMachine(ctx);
    const repoDir = getRepoDir(ctx);

    if (type === 'linux') return rebuildLinux(ctx, machine, repoDir);
    if (type === 'nixos') return rebuildNixos(ctx, machine, repoDir);
    return rebuildDarwin(ctx, machine, repoDir);
  },
};
