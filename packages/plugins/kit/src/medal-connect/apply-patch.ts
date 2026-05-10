// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { addApp, removeApp } from '../commands/apps.js';

export type KitPatchOp =
  | { kind: 'cask.add'; cask: string }
  | { kind: 'cask.remove'; cask: string }
  | { kind: 'raw.write'; path: string; content: string };

export interface KitPatch {
  ops: KitPatchOp[];
}

const FORBIDDEN_PREFIXES = ['secrets/', `secrets${sep}`, 'secrets'];

/**
 * Normalize and validate a relative path against the kit repo. Rejects:
 *   - Absolute paths (must be repo-relative)
 *   - Paths that resolve outside `repoDir` (traversal)
 *   - Paths that touch `secrets/` per spec §11
 */
function ensureSafePath(repoDir: string, relPath: string): string {
  if (isAbsolute(relPath)) {
    throw new Error(`path escapes kit repo (absolute): ${relPath}`);
  }
  const normalizedRepoDir = resolve(repoDir);
  const target = resolve(normalizedRepoDir, relPath);
  const rel = relative(normalizedRepoDir, target);
  if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path escapes kit repo: ${relPath}`);
  }
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (rel === 'secrets' || rel.startsWith(prefix)) {
      throw new Error(`Medal Connect cannot edit secrets paths: ${relPath}`);
    }
  }
  return target;
}

export async function applyKitPatch(repoDir: string, patch: KitPatch): Promise<void> {
  for (const op of patch.ops) {
    if (op.kind === 'cask.add') {
      await addApp(join(repoDir, 'apps', 'apps.json'), op.cask, 'casks');
    } else if (op.kind === 'cask.remove') {
      await removeApp(join(repoDir, 'apps', 'apps.json'), op.cask, 'casks');
    } else if (op.kind === 'raw.write') {
      const target = ensureSafePath(repoDir, op.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, op.content, 'utf8');
    } else {
      throw new Error(`unknown KitPatch op kind: ${(op as { kind: string }).kind}`);
    }
  }
}
