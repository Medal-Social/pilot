// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { type FSWatcher, existsSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { type SnapshotContext, snapshot } from './snapshot.js';

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

  const targets: Array<{ dir: string; file: string }> = [
    { dir: join(ctx.kitRepoDir, 'apps'), file: 'apps.json' },
    { dir: join(ctx.kitRepoDir, '.git'), file: 'HEAD' },
    { dir: join(ctx.kitRepoDir, '.medal-connect'), file: 'last-rebuild.json' },
  ];

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

  // Fallback: also watch the parent of `.medal-connect` so we pick up the
  // first write that creates the directory (snapshot's last-rebuild file).
  const mcParent = dirname(join(ctx.kitRepoDir, '.medal-connect'));
  try {
    const w = watch(mcParent, { persistent: false }, (_event, filename) => {
      if (filename === '.medal-connect') schedule();
    });
    w.on('error', () => undefined);
    watchers.push(w);
  } catch {
    // ignore
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
