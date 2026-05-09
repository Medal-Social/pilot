// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Slim wrapper over a plugin's domain event log row. Plugins decide what
 * lives in `payload`; Pilot only cares about the envelope.
 */
export interface SyncEvent {
  /** Originating plugin id, e.g. "@medalsocial/dispatch". */
  plugin: string;
  /** Plugin-scoped event id (must be monotonic per plugin per device). */
  id: string;
  /** Wall-clock timestamp (ms since epoch). */
  ts: number;
  /** Plugin-defined event kind, e.g. "task.created". */
  kind: string;
  /** Stable id of the device that produced this event. */
  deviceId: string;
  /** Plugin-shaped payload. */
  payload: Record<string, unknown>;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Optional Reply-To header; falls back to the workspace's no-reply. */
  replyTo?: string;
}

export interface MedalSocialContext {
  /** Workspace slug, e.g. "acme-co". */
  workspace: string;
  /** Workspace display name. */
  workspaceName: string;
  /** Authed user's Medal Social user id (stable). */
  userId: string;
  /** Authed user's display name. */
  userName: string;
  /** Authed user's primary email. */
  email: string;
}

export interface Logger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface PilotHost {
  cloud: { send(event: SyncEvent): Promise<void> };
  email: { send(msg: EmailMessage): Promise<{ id: string }> };
  secrets: { get(name: string): Promise<string | null> };
  auth: { medalSocial(): MedalSocialContext | null };
  log: Logger;
}
