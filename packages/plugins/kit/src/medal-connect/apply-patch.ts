// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { HOMEBREW_NAME } from '../apps/schema.js';
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
 *
 * Rejects:
 *   - empty / non-string paths
 *   - absolute paths
 *   - paths that resolve outside the repo (lexical traversal)
 *   - paths whose first segment is forbidden (case-insensitive)
 *   - paths whose target OR any ancestor inside the repo is a SYMLINK
 *     (Codex P1 sweep #2 — without this guard, a kit repo containing
 *     `modules/foo.nix → ../secrets/foo` would let `raw.write` bypass
 *     both the secrets/* and traversal guards, since the lexical check
 *     passes but `writeFileSync` follows the symlink).
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
  // Walk every existing ancestor inside the repo and validate:
  //   - reject symlinks (any component) — would redirect the write
  //   - reject non-directory ancestors (e.g. README.md/x.nix where
  //     README.md is a regular file) — phase 2's mkdirSync would throw
  //     ENOTDIR after some earlier op already mutated the apps file,
  //     leaving the kit repo dirty (Codex P2 sweep #5)
  //   - reject when the leaf path exists as a directory — writeFileSync
  //     would EISDIR with the same partial-application leak.
  //
  // Distinguish ENOENT (genuinely missing — fine, mkdirSync will create)
  // from other errno values (EACCES, ELOOP, etc.) which indicate a real
  // problem that should fail preflight.
  const segments = rel.split(sep);
  for (let i = 1; i <= segments.length; i++) {
    const partial = resolve(normalizedRepoDir, ...segments.slice(0, i));
    const isLeaf = i === segments.length;
    let stat: ReturnType<typeof lstatSync> | undefined;
    try {
      stat = lstatSync(partial);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Path component doesn't exist yet — fine. mkdirSync below will
        // create it (and any further missing components).
        break;
      }
      throw new Error(`Medal Connect cannot stat path ${relPath}: ${code ?? 'unknown'}`);
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Medal Connect cannot write through symlinks: ${relPath}`);
    }
    // Ancestor must be a directory; only the leaf may be a regular file
    // (which we'll overwrite). Reject ancestors that are files
    // (writeFileSync at phase 2 would otherwise fail with ENOTDIR after
    // a prior op already wrote the apps file) and reject leaf paths
    // that are directories (would fail with EISDIR).
    if (!isLeaf && !stat.isDirectory()) {
      throw new Error(`Medal Connect cannot write under non-directory: ${relPath}`);
    }
    if (isLeaf && stat.isDirectory()) {
      throw new Error(`Medal Connect cannot write to existing directory: ${relPath}`);
    }
  }
  return target;
}

/**
 * Apply a structured KitPatch to disk. Returns the list of repo-relative
 * paths that were mutated so the caller can `git add` exactly those files
 * before committing.
 *
 * Two-phase: preflight validates every op (op-kind well-formedness, raw
 * paths pass `ensureSafePath`) BEFORE any side effects. This avoids the
 * partial-application leak where a patch like
 * `[{raw.write: modules/x.nix}, {raw.write: secrets/y}]` would have
 * written `modules/x.nix` to disk and only then thrown on the secrets op,
 * leaving the kit repo dirty (Codex P2 sweep). With the preflight, either
 * the full patch applies or nothing changes.
 *
 * Cask ops are idempotent: a duplicate `cask.add` or a missing
 * `cask.remove` is treated as a no-op (matches the existing connect cask
 * flow's retry semantics in `kit-context.ts` addCask/removeCask).
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

  // Phase 1: PREFLIGHT — validate every op before any disk side effects.
  // Raw paths get the full ensureSafePath check (lexical traversal +
  // forbidden-segment + symlink); cask ops just need a non-empty string.
  // Unknown op kinds reject the whole patch. We resolve raw targets here
  // too so phase 2 can write without re-parsing.
  const rawTargets = new Map<KitPatchOp, string>();
  for (const op of patch.ops) {
    if (op.kind === 'cask.add' || op.kind === 'cask.remove') {
      if (typeof op.cask !== 'string' || op.cask.length === 0) {
        throw new Error(`invalid ${op.kind}: missing cask`);
      }
      // Mirror addApp's KIT_APPS_INVALID_NAME check up-front so a bad
      // cask name late in the patch doesn't slip past preflight, leaving
      // the kit repo dirty after an earlier op already wrote
      // (Codex P2 sweep: cask name validation in preflight).
      if (!HOMEBREW_NAME.test(op.cask)) {
        throw new Error(
          `invalid ${op.kind}: cask name must match Homebrew naming rules: ${op.cask}`
        );
      }
    } else if (op.kind === 'raw.write') {
      if (typeof op.content !== 'string') {
        throw new Error(`invalid raw.write: content must be a string`);
      }
      rawTargets.set(op, ensureSafePath(repoDir, op.path));
    } else {
      throw new Error(`unknown KitPatch op kind: ${(op as { kind: string }).kind}`);
    }
  }

  // Phase 2: APPLY. Every op has been validated; the only side effects
  // possible from here are duplicate-cask KitErrors (which we swallow per
  // the idempotency contract) and genuine I/O failures (rare; bubble up).
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
      const target = rawTargets.get(op);
      if (!target) {
        // Should be unreachable — preflight populated this map.
        throw new Error(`internal: missing preflight target for raw.write ${op.path}`);
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, op.content, 'utf8');
      trackMutation(target);
    }
  }
  return Array.from(mutated);
}

function isDuplicateKitError(e: unknown): boolean {
  if (e instanceof KitError) return e.code === errorCodes.KIT_APPS_DUPLICATE;
  if (typeof e !== 'object' || e === null) return false;
  return (e as { code?: unknown }).code === errorCodes.KIT_APPS_DUPLICATE;
}
