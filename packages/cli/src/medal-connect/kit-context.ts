// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { addApp, removeApp } from '@medalsocial/kit/commands/apps';
import { errorCodes, PilotError } from '../errors.js';
import { type Exec, realExec } from '../shell/exec.js';

export interface KitContext {
  kitRepoDir: string;
  user: string;
  machineType: 'darwin' | 'nixos' | string;
  runRebuild: () => Promise<{ ok: boolean; durationMs: number; error?: string }>;
  addCask: (cask: string) => Promise<void>;
  removeCask: (cask: string) => Promise<void>;
  /**
   * Stage + commit + push. When `paths` is provided, those repo-relative
   * files are explicitly `git add`-ed (used by the
   * `kit.apply-patch-and-rebuild` flow which mutates raw `.nix` files in
   * addition to the apps file). When omitted, falls back to staging only
   * the resolved apps file (legacy `kit.cask.add` / `kit.cask.remove`
   * flow).
   */
  commitAndPush: (message: string, paths?: readonly string[]) => Promise<void>;
  /**
   * Resolver for the machine-specific apps file path. The kit can migrate
   * `apps/apps.json` → `machines/<machine>.apps.json` mid-session, so we
   * re-resolve on each call.
   */
  resolveAppsFile: () => string;
}

export interface ResolveOptions {
  /**
   * Optional explicit kit.config.json path. When omitted, we use the kit
   * package's own resolution rules (`KIT_CONFIG` env > standard candidate
   * locations) so Medal Connect picks up the same config the standalone kit
   * commands already use — no second source of truth.
   */
  kitConfigPath?: string;
  /**
   * The kit machine name. kit.config.json keys machines by friendly name
   * (typically the hostname — `pilot kit` resolves them via `detectMachine`),
   * NOT by the cloud-side opaque `deviceId`. The connect command should
   * pass the local hostname here so existing kit configs work unmodified
   * (Codex P1 sweep — without this, every paired machine would hit
   * CONNECT_KIT_MACHINE_NOT_IN_CONFIG and run with zero providers).
   */
  machineId: string;
  /**
   * Subprocess execution interface. Defaulted to `realExec` so production
   * uses the canonical Pilot Exec abstraction (per the repo rule that all
   * `child_process` usage flow through `packages/cli/src/shell/exec.ts`).
   * Tests inject a fake to assert which commands were spawned.
   */
  exec?: Exec;
}

interface KitConfigRaw {
  machines?: Record<string, { type: string; user: string }>;
  gitStrategy?: string;
  repoDir?: string;
}

/**
 * Returns the resolved kit.config.json path, using the same resolution rules
 * as the standalone kit commands. Returns the first existing candidate so
 * Medal Connect and `pilot kit ...` always agree on which file is canonical.
 *
 * Falls back to the first candidate even when nothing exists, so the caller
 * can produce a "config not found at <X>" error pointing at the conventional
 * location rather than a synthetic placeholder.
 */
export async function getKitConfigPath(): Promise<string> {
  const { configCandidates } = await import('@medalsocial/kit');
  const candidates = configCandidates();
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0] ?? join(process.env.HOME ?? '~', 'Documents/Code/kit/kit.config.json');
}

/**
 * Reads kit.config.json, locates the machine entry, and wires the four
 * `MedalConnectKitProvider` deps (`runRebuild`/`addCask`/`removeCask`/
 * `commitAndPush`) to the underlying kit primitives.
 *
 * - `runRebuild` shells out to `darwin-rebuild` or `nixos-rebuild` per the
 *   machine type. `sudo` is invoked the same way the standalone kit command
 *   already does — Medal Connect does NOT introduce a new privilege boundary
 *   (spec §11; standards/security/secrets-and-credentials.md).
 * - `addCask`/`removeCask` patch `apps/apps.json` via the kit primitives.
 * - `commitAndPush` honors the `gitStrategy: 'none'` opt-out so machines that
 *   manage their own commits don't get double-committed.
 */
export async function resolveKitContext(opts: ResolveOptions): Promise<KitContext> {
  const exec = opts.exec ?? realExec;
  const kitConfigPath = opts.kitConfigPath ?? (await getKitConfigPath());
  if (!existsSync(kitConfigPath)) {
    throw new PilotError(errorCodes.CONNECT_KIT_CONFIG_NOT_FOUND, kitConfigPath);
  }
  const config = JSON.parse(readFileSync(kitConfigPath, 'utf8')) as KitConfigRaw;
  const machine = config.machines?.[opts.machineId];
  if (!machine) {
    throw new PilotError(errorCodes.CONNECT_KIT_MACHINE_NOT_IN_CONFIG, opts.machineId);
  }
  // Match the kit loader's repoDir derivation: explicit `repoDir` (with `~`
  // expansion + relative-to-config resolution) wins, otherwise fall back to
  // the directory of the config file itself.
  const kitRepoDir = config.repoDir
    ? resolveRepoDir(config.repoDir, kitConfigPath)
    : dirname(kitConfigPath);
  const machineType = machine.type;

  // Apps file resolution is dynamic — `pilot kit update` can migrate a legacy
  // apps/apps.json into machines/<machineId>.apps.json while the agent is
  // running, and the next cask command MUST follow the new file or rebuilds
  // will diverge from the cloud's view. Re-resolve per call (cheap — a
  // single readdir + statSync per `machines/`) instead of caching the
  // setup-time path (Codex P2 sweep #8).
  const currentAppsFile = () => resolveMachineAppsFile(kitRepoDir, opts.machineId);

  return {
    kitRepoDir,
    user: machine.user,
    machineType,
    runRebuild: async () => {
      const start = Date.now();
      const cmd = machineType === 'darwin' ? 'darwin-rebuild' : 'nixos-rebuild';
      const r = await exec.run('sudo', [cmd, 'switch', '--flake', `.#${opts.machineId}`], {
        cwd: kitRepoDir,
      });
      return {
        ok: r.code === 0,
        durationMs: Date.now() - start,
        error: r.code === 0 ? undefined : r.stderr.slice(0, 500),
      };
    },
    addCask: async (cask) => {
      // Treat KIT_APPS_DUPLICATE as a no-op so we still reach commitAndPush.
      // This makes kit.cask.add idempotent on retry: when an earlier
      // attempt's git push failed (network/credentials) the local commit
      // is still present, but a naive retry would throw on the duplicate
      // before reaching the push. By swallowing the duplicate we let the
      // unchanged push step send the pending commit (Codex P2 sweep).
      try {
        await addApp(currentAppsFile(), cask, 'casks');
      } catch (e) {
        if (!isDuplicateError(e)) throw e;
      }
    },
    removeCask: async (cask) => {
      // Symmetric idempotency: removing an already-removed cask is a no-op.
      // removeApp doesn't currently throw for missing entries (it filters),
      // but we still wrap for symmetry with addCask in case the
      // implementation changes.
      try {
        await removeApp(currentAppsFile(), cask, 'casks');
      } catch (e) {
        if (!isDuplicateError(e)) throw e;
      }
    },
    resolveAppsFile: currentAppsFile,
    commitAndPush: async (message, paths) => {
      const skip = config.gitStrategy === 'none';
      if (skip) return;
      // Three-way branching on `paths`:
      //   undefined  → legacy cask.add / cask.remove flow; stage only the
      //                resolved apps file.
      //   empty []   → explicit "no files to stage" — apply-patch-and-rebuild
      //                with an empty patch. Skip the entire add/commit/push
      //                cycle so the empty patch can't accidentally commit
      //                unrelated worktree edits under the cloud-supplied
      //                message (Codex P2 sweep — empty-explicit-paths fallback).
      //   non-empty  → apply-patch-and-rebuild with mutated paths; stage
      //                exactly those.
      if (paths && paths.length === 0) return;
      const stagePaths = paths ? Array.from(paths) : [relative(kitRepoDir, currentAppsFile())];

      // `git add` is expected to succeed: the path(s) were just written
      // (or, for the apps-file fallback, the path was resolved at setup
      // time and is known to exist). Any non-zero exit is a real error
      // (index lock, path validation, permissions) and MUST bubble up so
      // the cloud sees a failed command instead of ok:true on a
      // half-applied edit (Codex P2 sweep).
      //
      // `--literal-pathspecs` is a TOP-LEVEL git option (not a `git add`
      // option), so it precedes the subcommand: `git
      // --literal-pathspecs add -- <paths>`. The option disables Git's
      // pathspec magic (`:(glob)`, `:!exclude`, etc.) so a path that
      // happens to contain `:(...)` characters (legal on Linux
      // filenames) is staged as a literal filename rather than
      // interpreted as a magic pathspec — which would otherwise let a
      // remote `raw.write` patch with `:(glob)secrets/*` stage worktree
      // files outside the file we actually wrote (Codex P1 sweep —
      // stage raw-write paths as literal Git pathspecs; Codex P1 follow-up
      // — `git add --literal-pathspecs` errors with "unknown option",
      // the flag MUST be top-level).
      const r1 = await exec.run('git', ['--literal-pathspecs', 'add', '--', ...stagePaths], {
        cwd: kitRepoDir,
      });
      if (r1.code !== 0) {
        const detail = r1.stderr.trim().slice(0, 500);
        throw new Error(`git add failed: ${detail || `exit ${r1.code}`}`);
      }

      // `git commit` exits 1 with the literal "nothing to commit" message
      // when the working tree is clean. That's the only benign non-zero —
      // hook failures, missing user.email, lock errors, etc. all surface
      // here too with different messages, so check before swallowing.
      const r2 = await exec.run('git', ['commit', '-m', message], { cwd: kitRepoDir });
      if (r2.code !== 0) {
        // `git commit` prints "nothing to commit" to STDOUT (not stderr) when
        // the tree is clean — combine both streams to detect the no-op case.
        const combined = `${r2.stdout || ''}\n${r2.stderr || ''}`.toLowerCase();
        const isNoOp = /nothing to commit|no changes added/.test(combined);
        if (!isNoOp) {
          const detail = r2.stderr.trim().slice(0, 500);
          throw new Error(`git commit failed: ${detail || `exit ${r2.code}`}`);
        }
        // No-op commit (no staged diff) — but DO NOT skip the push. A
        // previous attempt may have committed locally and only failed on
        // push (network/creds); the retry's addCask/removeCask swallowed
        // the duplicate, so this branch is the recovery path. Falling
        // through to `git push` sends any pending unpushed commits;
        // `git push` is itself a no-op when the local branch matches
        // upstream (Codex P2 sweep #7 'Push pending commits after no-op').
      }

      // `git push` failures MUST surface — otherwise execKit returns ok:true
      // while the cloud's view of the kit repo diverges from every other
      // machine that pulls from the remote.
      const r3 = await exec.run('git', ['push'], { cwd: kitRepoDir });
      if (r3.code !== 0) {
        const detail = r3.stderr.trim().slice(0, 500);
        throw new Error(`git push failed: ${detail || `exit ${r3.code}`}`);
      }
    },
  };
}

/**
 * Locate the machine-specific apps file (`machines/<machine>.apps.json`),
 * matching `pilot kit apps`'s `findMachineFile()` logic. If no machine
 * file exists but the legacy single-file location does, target that — the
 * snapshot side does the same fallback, so cask edits and snapshots agree
 * on the file in both layouts (Codex P2 sweep #6). Final fallback is the
 * conventional machine path for fresh repos so the first add lands
 * somewhere predictable.
 */
function resolveMachineAppsFile(repoDir: string, machineId: string): string {
  const target = `${machineId}.apps.json`;
  const found = findInDir(join(repoDir, 'machines'), target);
  if (found) return found;
  const legacy = join(repoDir, 'apps', 'apps.json');
  if (existsSync(legacy)) return legacy;
  return join(repoDir, 'machines', target);
}

/**
 * Detect KitError(KIT_APPS_DUPLICATE). We can't import the error directly
 * (would require a runtime dependency on the error class identity across
 * the @medalsocial/kit package boundary), so match on the discriminating
 * `code` field that KitError attaches.
 */
function isDuplicateError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === 'KIT_APPS_DUPLICATE';
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

function resolveRepoDir(repoDir: string, configPath: string): string {
  // Expand `~/...` against $HOME to match the kit loader.
  let expanded = repoDir;
  const home = process.env.HOME ?? '';
  if (expanded === '~') expanded = home;
  else if (expanded.startsWith('~/')) expanded = join(home, expanded.slice(2));
  // Treat absolute paths as-is; resolve relative paths against the config dir
  // so the same kit.config.json works on machines with different layouts.
  if (expanded.startsWith('/')) return expanded;
  return join(dirname(configPath), expanded);
}
