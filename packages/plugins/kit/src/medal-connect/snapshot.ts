// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readGitState } from './git.js';

export interface SnapshotContext {
  kitRepoDir: string;
  machineId: string;
  user: string;
  machineType: 'darwin' | 'nixos' | string;
}

export interface KitStateSnapshot {
  profile: 'workstation' | 'server' | 'minimal';
  kitRepoHead: string | null;
  ahead: number;
  behind: number;
  apps: string[];
  lastRebuildAt?: number;
  lastRebuildOk?: boolean;
  secretsSyncedAt?: number;
}

/**
 * Locate the machine-specific apps file. kit's canonical layout puts these
 * at `machines/<machine>.apps.json` (recursively searched per
 * `commands/kit.ts findMachineFile`), NOT a single shared `apps/apps.json`.
 * The legacy single-file location is kept as a final fallback so older
 * scaffolds still report a non-empty snapshot (Codex P1 sweep — feeds the
 * cloud the apps the user actually has).
 */
export function resolveAppsFile(repoDir: string, machineId: string): string | null {
  const machinesRoot = join(repoDir, 'machines');
  const direct = findInDir(machinesRoot, `${machineId}.apps.json`);
  if (direct) return direct;
  const legacy = join(repoDir, 'apps', 'apps.json');
  if (existsSync(legacy)) return legacy;
  return null;
}

function findInDir(root: string, target: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(root, entry);
    if (entry === target) return full;
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      const nested = findInDir(full, target);
      if (nested) return nested;
    }
  }
  return null;
}

function readApps(repoDir: string, machineId: string): string[] {
  const path = resolveAppsFile(repoDir, machineId);
  if (!path) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { casks?: unknown };
    if (!Array.isArray(parsed.casks)) return [];
    const filtered = parsed.casks.filter((x): x is string => typeof x === 'string');
    return [...filtered].sort();
  } catch {
    return [];
  }
}

function readLastRebuild(repoDir: string): { at?: number; ok?: boolean } {
  const path = join(repoDir, '.medal-connect', 'last-rebuild.json');
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { at?: unknown; ok?: unknown };
    return {
      at: typeof parsed.at === 'number' ? parsed.at : undefined,
      ok: typeof parsed.ok === 'boolean' ? parsed.ok : undefined,
    };
  } catch {
    return {};
  }
}

function profileFor(machineType: string): KitStateSnapshot['profile'] {
  if (machineType === 'nixos') return 'server';
  if (machineType === 'darwin') return 'workstation';
  return 'minimal';
}

export async function snapshot(ctx: SnapshotContext): Promise<KitStateSnapshot> {
  const git = await readGitState(ctx.kitRepoDir);
  const last = readLastRebuild(ctx.kitRepoDir);
  return {
    profile: profileFor(ctx.machineType),
    kitRepoHead: git.kitRepoHead,
    ahead: git.ahead,
    behind: git.behind,
    apps: readApps(ctx.kitRepoDir, ctx.machineId),
    lastRebuildAt: last.at,
    lastRebuildOk: last.ok,
  };
}
