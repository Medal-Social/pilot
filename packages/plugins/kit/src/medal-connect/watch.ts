// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { type FSWatcher, existsSync, readFileSync, watch } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { resolveAppsFile, type SnapshotContext, snapshot } from './snapshot.js';

export interface WatchOptions {
  /** Debounce window for coalescing rapid file changes. Default 500ms. */
  debounceMs?: number;
}

export interface KitStateEvent {
  kind: 'kit.state';
  snapshot: Awaited<ReturnType<typeof snapshot>>;
}

export interface Disposable {
  dispose(): void;
}

/**
 * Watches the kit repo for changes that affect the snapshot — apps.json, the
 * git HEAD pointer, and the locally written last-rebuild marker. Emits a
 * `kit.state` event with the freshly computed snapshot whenever any of those
 * files changes (debounced to coalesce rapid edits).
 *
 * Implementation note: uses `node:fs.watch` rather than chokidar to avoid
 * adding a new dependency. We watch each parent directory (creating it if
 * missing for `.medal-connect`) and filter by basename, which is sufficient
 * for v1 (a single source of truth per file).
 */
export function watchKit(
  ctx: SnapshotContext,
  emit: (event: KitStateEvent) => void,
  opts: WatchOptions = {}
): Disposable {
  const debounce = opts.debounceMs ?? 500;

  // Watch the resolved machine-specific apps file (machines/<id>.apps.json),
  // falling back to the legacy single-file location when no machine entry
  // exists (`apps/apps.json`). Picking the file dynamically here means the
  // watcher follows whichever file the snapshot reads — keeping cloud state
  // consistent with what `pilot kit apps` mutates.
  const appsFile = resolveAppsFile(ctx.kitRepoDir, ctx.machineId);
  const targets: Array<{ dir: string; file: string }> = [
    { dir: join(ctx.kitRepoDir, '.medal-connect'), file: 'last-rebuild.json' },
  ];

  // Watch git state. `.git/HEAD` mutates on branch switch (or detached
  // checkout); on a normal branch checkout, commits / pulls / pushes update
  // `.git/refs/heads/<branch>` instead. Watch HEAD always; the branch ref
  // is set up dynamically below so it follows branch switches without
  // needing an agent reconnect (Codex P2 sweep).
  targets.push({ dir: join(ctx.kitRepoDir, '.git'), file: 'HEAD' });
  // packed-refs covers the case where `git gc` / `git pack-refs` moves the
  // loose ref into the packed file.
  const packed = join(ctx.kitRepoDir, '.git', 'packed-refs');
  if (existsSync(packed)) {
    targets.push({ dir: dirname(packed), file: basename(packed) });
  }

  if (appsFile) {
    targets.push({ dir: dirname(appsFile), file: basename(appsFile) });
  } else {
    // No apps file yet — watch the conventional machine path so the first
    // creation triggers a snapshot refresh.
    targets.push({
      dir: join(ctx.kitRepoDir, 'machines'),
      file: `${ctx.machineId}.apps.json`,
    });
  }

  let pending: NodeJS.Timeout | null = null;
  let disposed = false;
  const watchers: FSWatcher[] = [];

  const fire = () => {
    if (disposed) return;
    snapshot(ctx)
      .then((snap) => {
        if (!disposed) emit({ kind: 'kit.state', snapshot: snap });
      })
      .catch(() => undefined);
  };

  const schedule = () => {
    if (disposed) return;
    if (pending) clearTimeout(pending);
    pending = setTimeout(fire, debounce);
  };

  for (const { dir: watchDir, file } of targets) {
    if (!existsSync(watchDir)) continue;
    try {
      const w = watch(watchDir, { persistent: false }, (_event, filename) => {
        if (!filename) return;
        // The filename is relative to the watched directory; match exact basename.
        if (filename === file) schedule();
      });
      // Errors from the underlying inotify/FSEvents handle should not crash
      // the agent — log via dispose() rather than process exit.
      w.on('error', () => undefined);
      watchers.push(w);
    } catch {
      // Ignore — directory may not exist or platform may not support the
      // watch API for this path. The snapshot is still re-read on connect.
    }
  }

  // Branch-ref watcher (Codex P2 'Rewire after branch changes'). The branch
  // ref path is derived from .git/HEAD's contents, so a `git checkout
  // other-branch` invalidates the previous watcher. We track the active
  // branch-ref watcher in a slot and rewire it whenever HEAD changes — the
  // HEAD watcher above still triggers `schedule()`, and the rewire happens
  // alongside (snapshot + rewatch).
  let branchWatcher: FSWatcher | null = null;
  let watchedBranchRef: string | null = null;
  const rewireBranchRef = () => {
    if (disposed) return;
    const next = readBranchRef(ctx.kitRepoDir);
    if (!next || next.absPath === watchedBranchRef) return;
    if (branchWatcher) {
      try {
        branchWatcher.close();
      } catch {
        // ignore
      }
      branchWatcher = null;
    }
    try {
      const w = watch(
        dirname(next.absPath),
        { persistent: false },
        (_event, filename) => {
          if (filename === basename(next.absPath)) schedule();
        }
      );
      w.on('error', () => undefined);
      branchWatcher = w;
      watchedBranchRef = next.absPath;
      watchers.push(w);
    } catch {
      // Branch ref dir may not exist yet (fresh clone before first commit).
      // Subsequent HEAD changes will retry.
    }
  };
  // Initial wire so existing branch state is watched immediately.
  rewireBranchRef();
  // Re-wire whenever HEAD changes (branch switch). We attach this as a
  // separate watcher rather than overloading `schedule()` because we need
  // the rewire to fire on every HEAD event, not just the debounced one.
  try {
    const headWatcher = watch(
      join(ctx.kitRepoDir, '.git'),
      { persistent: false },
      (_event, filename) => {
        if (filename === 'HEAD') rewireBranchRef();
      }
    );
    headWatcher.on('error', () => undefined);
    watchers.push(headWatcher);
  } catch {
    // ignore
  }

  // .medal-connect/last-rebuild.json watcher. The targets loop skips this
  // when the directory doesn't exist yet (fresh kit repo). When that's the
  // case we watch the parent for the directory's creation, then install
  // the real file watcher so subsequent kit.rebuild commands emit kit.state
  // events instead of silently overwriting the marker (Codex P2 sweep).
  const mcDir = join(ctx.kitRepoDir, '.medal-connect');
  let lastRebuildWatcher: FSWatcher | null = null;
  const ensureLastRebuildWatcher = () => {
    if (disposed || lastRebuildWatcher) return;
    if (!existsSync(mcDir)) return;
    try {
      const w = watch(mcDir, { persistent: false }, (_event, filename) => {
        if (filename === 'last-rebuild.json') schedule();
      });
      w.on('error', () => undefined);
      lastRebuildWatcher = w;
      watchers.push(w);
    } catch {
      // ignore — best effort.
    }
  };
  // Wire it now if .medal-connect already exists. (The targets loop above
  // also installs this when present, so this is mostly idempotent — duplicate
  // watchers are harmless because each only schedules a debounced snapshot.)
  ensureLastRebuildWatcher();
  // Otherwise, watch the parent so we install the real watcher the moment
  // `.medal-connect/` is created, then schedule the first snapshot.
  if (!existsSync(mcDir)) {
    const mcParent = dirname(mcDir);
    try {
      const w = watch(mcParent, { persistent: false }, (_event, filename) => {
        if (filename !== '.medal-connect') return;
        ensureLastRebuildWatcher();
        schedule();
      });
      w.on('error', () => undefined);
      watchers.push(w);
    } catch {
      // ignore
    }
  }

  return {
    dispose() {
      disposed = true;
      if (pending) clearTimeout(pending);
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // ignore
        }
      }
    },
  };
}

/**
 * Resolve the absolute path of the branch ref file pointed to by HEAD.
 *
 *   .git/HEAD → "ref: refs/heads/main\n"  → .git/refs/heads/main
 *
 * Returns null when HEAD is detached, the file is missing, or the loose
 * ref isn't materialized (e.g. fully packed). Caller still watches HEAD,
 * so a future branch-switch is picked up regardless.
 */
function readBranchRef(repoDir: string): { absPath: string } | null {
  const headPath = join(repoDir, '.git', 'HEAD');
  if (!existsSync(headPath)) return null;
  let content: string;
  try {
    content = readFileSync(headPath, 'utf8');
  } catch {
    return null;
  }
  const match = content.match(/^ref:\s+(\S+)/);
  if (!match) return null; // detached HEAD
  const refRel = match[1];
  if (!refRel) return null;
  const absPath = join(repoDir, '.git', refRel);
  return { absPath };
}
