// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { addApp, removeApp } from '../commands/apps.js';
import { errorCodes, KitError } from '../errors.js';

export type KitPatchOp =
  | { kind: 'cask.add'; cask: string }
  | { kind: 'cask.remove'; cask: string }
  | { kind: 'raw.write'; path: string; content: string };

export interface KitPatch {
  ops: KitPatchOp[];
}

export interface ApplyKitPatchOptions {
  /**
   * Absolute filesystem path to the machine's resolved apps JSON
   * (`machines/<machine>.apps.json` in the modern layout, falling back to
   * `apps/apps.json` for legacy kits). The kit-context exposes a resolver
   * that handles the dynamic case; passing the resolved path in keeps this
   * function pure and matches what `commitAndPush` will stage.
   */
  appsFilePath: string;
}

/**
 * Forbidden top-level path segments. Compared case-insensitively (macOS
 * default volumes are case-insensitive) against the FIRST repo-relative
 * segment, so attempts like `Secrets/...`, `SECRETS/...`, `.git/hooks/...`
 * are rejected uniformly.
 *
 *  - `secrets` — Medal Connect spec §11 invariant
 *  - `.git`    — patch-controlled git internals (hooks, config) would let a
 *                remote patch hijack the subsequent commitAndPush
 *  - `.medal-connect` — agent-internal state (last-rebuild marker, etc.);
 *                shouldn't be remote-writable either
 */
const FORBIDDEN_FIRST_SEGMENTS = new Set(['secrets', '.git', '.medal-connect']);

/**
 * Normalize and validate a relative path against the kit repo. Returns the
 * absolute target path on success. Throws a `KitError` (or wrapped Error
 * for the spec-§11 secrets case so the cloud can pattern-match on
 * "secrets") on any guard failure.
 */
function ensureSafePath(repoDir: string, relPath: string): string {
  if (typeof relPath !== 'string' || relPath.length === 0) {
    throw new Error('invalid path: empty');
  }
  if (isAbsolute(relPath)) {
    throw new Error(`path escapes kit repo (absolute): ${relPath}`);
  }
  const normalizedRepoDir = resolve(repoDir);
  const target = resolve(normalizedRepoDir, relPath);
  const rel = relative(normalizedRepoDir, target);
  if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path escapes kit repo: ${relPath}`);
  }
  // Use OS path-separator splitting so `secrets/x` and `secrets\\x` are both
  // treated as a `secrets` first segment.
  const firstSegment = rel.split(sep)[0]?.toLowerCase() ?? '';
  if (FORBIDDEN_FIRST_SEGMENTS.has(firstSegment)) {
    if (firstSegment === 'secrets') {
      // Distinguished error message so the cloud-side activity feed can
      // surface "secrets paths cannot be edited" verbatim.
      throw new Error(`Medal Connect cannot edit secrets paths: ${relPath}`);
    }
    throw new Error(`Medal Connect cannot edit ${firstSegment} paths: ${relPath}`);
  }
  return target;
}

/**
 * Apply a structured KitPatch to disk. Returns the list of repo-relative
 * paths that were mutated so the caller can `git add` exactly those files
 * before committing — staging the apps file alone (the legacy commitAndPush
 * behavior) would leave raw.write outputs uncommitted and the rebuild would
 * test local-only state.
 *
 * Cask ops are idempotent: a duplicate `cask.add` or a missing
 * `cask.remove` is treated as a no-op (matches the existing connect cask
 * flow's retry semantics — see `kit-context.ts` `addCask`/`removeCask`).
 */
export async function applyKitPatch(
  repoDir: string,
  patch: KitPatch,
  opts: ApplyKitPatchOptions
): Promise<string[]> {
  const normalizedRepoDir = resolve(repoDir);
  const mutated = new Set<string>();
  const trackMutation = (absPath: string) => {
    mutated.add(relative(normalizedRepoDir, absPath));
  };

  for (const op of patch.ops) {
    if (op.kind === 'cask.add') {
      try {
        await addApp(opts.appsFilePath, op.cask, 'casks');
      } catch (e) {
        // Idempotent on duplicate — the existing apps file is what we want.
        if (!isDuplicateKitError(e)) throw e;
      }
      trackMutation(opts.appsFilePath);
    } else if (op.kind === 'cask.remove') {
      // removeApp filters silently; wrap defensively in case future
      // implementations throw on missing entries.
      try {
        await removeApp(opts.appsFilePath, op.cask, 'casks');
      } catch (e) {
        if (!isDuplicateKitError(e)) throw e;
      }
      trackMutation(opts.appsFilePath);
    } else if (op.kind === 'raw.write') {
      const target = ensureSafePath(repoDir, op.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, op.content, 'utf8');
      trackMutation(target);
    } else {
      throw new Error(`unknown KitPatch op kind: ${(op as { kind: string }).kind}`);
    }
  }
  return Array.from(mutated);
}

function isDuplicateKitError(e: unknown): boolean {
  if (e instanceof KitError) return e.code === errorCodes.KIT_APPS_DUPLICATE;
  if (typeof e !== 'object' || e === null) return false;
  return (e as { code?: unknown }).code === errorCodes.KIT_APPS_DUPLICATE;
}
