// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from 'node:fs';
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

function readApps(repoDir: string): string[] {
  const path = join(repoDir, 'apps', 'apps.json');
  if (!existsSync(path)) return [];
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
    apps: readApps(ctx.kitRepoDir),
    lastRebuildAt: last.at,
    lastRebuildOk: last.ok,
  };
}
