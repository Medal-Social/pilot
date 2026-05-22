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
 *   1. `sudo system-manager switch --flake .#<machine>` — system layer.
 *      Resolved via `which` (because sudo strips PATH and the binary lives
 *      under ~/.nix-profile/bin); falls back to `sudo nix run github:numtide/system-manager`
 *      when neither is on PATH yet (fresh machine, before any
 *      `nix profile add github:numtide/system-manager`).
 *   2. `home-manager switch --flake .#<machine>` — user layer.
 *      Same pattern: prefer the installed binary, fall back to `nix run`.
 */
async function rebuildLinux(ctx: StepContext, machine: string, repoDir: string): Promise<void> {
  const sm = await runSystemManager(ctx, machine, repoDir);
  if (sm.code !== 0) throw new KitError(errorCodes.KIT_REBUILD_FAILED, sm.stderr);

  const hm = await runHomeManager(ctx, machine, repoDir);
  if (hm.code !== 0) throw new KitError(errorCodes.KIT_REBUILD_FAILED, hm.stderr);
}

async function runSystemManager(
  ctx: StepContext,
  machine: string,
  repoDir: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  const whichSm = await ctx.exec.run('which', ['system-manager']);
  if (whichSm.code === 0 && whichSm.stdout.trim()) {
    return ctx.exec.run('sudo', [whichSm.stdout.trim(), 'switch', '--flake', `.#${machine}`], {
      cwd: repoDir,
    });
  }
  // Bootstrap fallback: `system-manager` isn't installed yet. Run it via
  // `nix run` so the first activation works on a fresh machine where only
  // Nix itself is present. Resolve `nix` absolute path because sudo strips PATH.
  const whichNix = await ctx.exec.run('which', ['nix']);
  const nixBin = whichNix.code === 0 && whichNix.stdout.trim() ? whichNix.stdout.trim() : 'nix';
  return ctx.exec.run(
    'sudo',
    [nixBin, 'run', 'github:numtide/system-manager', '--', 'switch', '--flake', `.#${machine}`],
    { cwd: repoDir }
  );
}

async function runHomeManager(
  ctx: StepContext,
  machine: string,
  repoDir: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  const whichHm = await ctx.exec.run('which', ['home-manager']);
  if (whichHm.code === 0 && whichHm.stdout.trim()) {
    return ctx.exec.run('home-manager', ['switch', '--flake', `.#${machine}`], { cwd: repoDir });
  }
  return ctx.exec.run(
    'nix',
    ['run', 'github:nix-community/home-manager', '--', 'switch', '--flake', `.#${machine}`],
    { cwd: repoDir }
  );
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
