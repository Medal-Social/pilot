// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applyKitPatch } from './apply-patch.js';

export type { KitPatch, KitPatchOp } from './apply-patch.js';

import { type ExecDeps, execKit } from './exec.js';
import { type SnapshotContext, snapshot } from './snapshot.js';
import { watchKit } from './watch.js';

/**
 * Local mirror of the `MedalConnectProvider` shape from
 * `@medalsocial/pilot/medal-connect/provider-types`. We declare it here so the
 * kit plugin does not depend on the CLI package; the structural match is
 * verified at the seam where the CLI registers a provider it received.
 */
export interface ProviderCapability {
  verb: string;
  requiresUser?: 'never' | 'optional' | 'always';
  stepUp?: 'none' | 'recommended' | 'required';
}

export interface ProviderStateSnapshot {
  [key: string]: unknown;
}

export type ProviderEvent =
  | { kind: 'state'; snapshot: ProviderStateSnapshot }
  | { kind: string; payload: Record<string, unknown> };

export interface Disposable {
  dispose(): void;
}

export interface MedalConnectProvider {
  readonly id: string;
  capabilities(): ProviderCapability[];
  snapshot(): Promise<ProviderStateSnapshot>;
  watch(emit: (event: ProviderEvent) => void): Disposable;
  exec(cmd: { kind: string; args: Record<string, unknown> }): Promise<
    | { status: 'ok'; result?: Record<string, unknown> }
    | { status: 'failed'; error: string }
    | {
        status: 'awaiting_user';
        prompt: {
          kind: 'piv_pin' | 'touchid' | 'yubikey_otp' | 'sso_push';
          reason: string;
          ttlSec: number;
        };
      }
  >;
}

export interface CreateKitProviderOptions extends SnapshotContext {
  runRebuild: ExecDeps['runRebuild'];
  addCask: ExecDeps['addCask'];
  removeCask: ExecDeps['removeCask'];
  commitAndPush: ExecDeps['commitAndPush'];
  /**
   * Resolver for the machine-specific apps file. The kit can migrate
   * `apps/apps.json` → `machines/<machine>.apps.json` mid-session, so the
   * provider re-resolves on each call. The plugin doesn't know the layout —
   * the CLI's `kit-context.ts` does — so we accept a closure here.
   */
  resolveAppsFile: () => string;
}

const CAPABILITIES: ProviderCapability[] = [
  { verb: 'rebuild', requiresUser: 'never', stepUp: 'none' },
  { verb: 'cask.add', requiresUser: 'never', stepUp: 'none' },
  { verb: 'cask.remove', requiresUser: 'never', stepUp: 'none' },
  { verb: 'apply-patch-and-rebuild', requiresUser: 'never', stepUp: 'none' },
];

export function createKitProvider(opts: CreateKitProviderOptions): MedalConnectProvider {
  const ctx: SnapshotContext = {
    kitRepoDir: opts.kitRepoDir,
    machineId: opts.machineId,
    user: opts.user,
    machineType: opts.machineType,
  };

  const persistLastRebuild = async (state: { at: number; ok: boolean }): Promise<void> => {
    const target = join(ctx.kitRepoDir, '.medal-connect', 'last-rebuild.json');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(state));
  };

  const deps: ExecDeps = {
    runRebuild: opts.runRebuild,
    addCask: opts.addCask,
    removeCask: opts.removeCask,
    persistLastRebuild,
    commitAndPush: opts.commitAndPush,
    applyPatch: (repoDir, patch) =>
      applyKitPatch(repoDir, patch, { appsFilePath: opts.resolveAppsFile() }),
  };

  return {
    id: 'kit',
    capabilities: () => [...CAPABILITIES],
    snapshot: async () => (await snapshot(ctx)) as unknown as ProviderStateSnapshot,
    watch: (emit: (event: ProviderEvent) => void) =>
      watchKit(ctx, (e) =>
        emit({ kind: 'state', snapshot: e.snapshot as unknown as ProviderStateSnapshot })
      ),
    exec: (cmd) => execKit(cmd, ctx, deps),
  };
}
