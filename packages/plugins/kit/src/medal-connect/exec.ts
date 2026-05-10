// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { SnapshotContext } from './snapshot.js';

/**
 * Local mirror of the `MedalConnectProvider` shapes from
 * `@medalsocial/pilot/src/medal-connect/provider-types`. We avoid a direct
 * cross-package import so the kit plugin stays independent of the CLI; the
 * shapes are checked structurally at the seam where `createKitProvider`
 * returns a `MedalConnectProvider`.
 */
export interface ProviderCommand {
  kind: string;
  args: Record<string, unknown>;
}

export type ExecResult =
  | { status: 'ok'; result?: Record<string, unknown> }
  | { status: 'failed'; error: string }
  | {
      status: 'awaiting_user';
      prompt: {
        kind: 'piv_pin' | 'touchid' | 'yubikey_otp' | 'sso_push';
        reason: string;
        ttlSec: number;
      };
    };

export interface ExecDeps {
  runRebuild: () => Promise<{ ok: boolean; durationMs: number; error?: string }>;
  addCask: (cask: string) => Promise<void>;
  removeCask: (cask: string) => Promise<void>;
  persistLastRebuild: (state: { at: number; ok: boolean }) => Promise<void>;
  commitAndPush: (message: string) => Promise<void>;
}

export async function execKit(
  cmd: ProviderCommand,
  _ctx: SnapshotContext,
  deps: ExecDeps
): Promise<ExecResult> {
  if (!cmd.kind.startsWith('kit.')) {
    return { status: 'failed', error: `wrong provider: ${cmd.kind}` };
  }
  const verb = cmd.kind.slice('kit.'.length);

  if (verb === 'rebuild') {
    try {
      const r = await deps.runRebuild();
      await deps.persistLastRebuild({ at: Date.now(), ok: r.ok });
      if (!r.ok) {
        return { status: 'failed', error: r.error ?? 'rebuild failed' };
      }
      return { status: 'ok', result: { durationMs: r.durationMs } };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await deps.persistLastRebuild({ at: Date.now(), ok: false }).catch(() => undefined);
      return { status: 'failed', error };
    }
  }

  if (verb === 'cask.add' || verb === 'cask.remove') {
    const cask = cmd.args.cask;
    if (typeof cask !== 'string' || cask.length === 0) {
      return { status: 'failed', error: 'missing or invalid cask arg' };
    }
    try {
      if (verb === 'cask.add') await deps.addCask(cask);
      else await deps.removeCask(cask);
      await deps.commitAndPush(`connect: ${verb} ${cask}`);
      return { status: 'ok', result: { cask } };
    } catch (e) {
      return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { status: 'failed', error: `unknown kit verb: ${verb}` };
}
