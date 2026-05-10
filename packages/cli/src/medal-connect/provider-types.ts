// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

// Per spec §5 (revised). Open to non-kit providers (dispatch, talk, pulse, skills).

export interface ProviderStateSnapshot {
  // Provider-specific shape; kit fills in KitStateSnapshot from spec §5.
  [key: string]: unknown;
}

export type ProviderEvent =
  | { kind: 'state'; snapshot: ProviderStateSnapshot }
  | { kind: string; payload: Record<string, unknown> };

export interface ProviderCommand {
  kind: string; // namespaced: '<provider-id>.<verb>'
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

export interface ProviderCapability {
  verb: string; // e.g. 'rebuild', 'cask.add'
  requiresUser?: 'never' | 'optional' | 'always'; // device-side interactive auth (v1.1)
  stepUp?: 'none' | 'recommended' | 'required'; // cloud-side MFA step-up (v1.1)
}

export interface Disposable {
  dispose(): void;
}

export interface MedalConnectProvider {
  readonly id: string; // 'kit' | 'dispatch' | 'talk' | 'pulse' | string
  capabilities(): ProviderCapability[];
  snapshot(): Promise<ProviderStateSnapshot>;
  watch(emit: (event: ProviderEvent) => void): Disposable;
  exec(cmd: ProviderCommand): Promise<ExecResult>;
}
