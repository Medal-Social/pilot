// NOTE: This file is duplicated from apps/workers/medal-connect/src/frames.ts.
// Both the Worker and CLI use the same zod schemas to parse WS frames in
// opposite directions. Keep them in sync until v1.1 extracts a shared package.

import { z } from 'zod';

const Hello = z.object({
  type: z.literal('hello'),
  deviceId: z.string().min(1),
  token: z.string().min(1),
  since: z.number().int().nonnegative(),
});

const Heartbeat = z.object({
  type: z.literal('heartbeat'),
  ts: z.number().int().positive(),
});

const Event = z.object({
  type: z.literal('event'),
  kind: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

const CommandAck = z.object({
  type: z.literal('command_ack'),
  commandId: z.string().min(1),
  received: z.boolean(),
});

const CommandResult = z.object({
  type: z.literal('command_result'),
  commandId: z.string().min(1),
  ok: z.boolean(),
  // Convention: when ok=true, `result` carries success payload and `error` is unset.
  // When ok=false, `error` carries the failure reason and `result` is unset.
  // Schema is intentionally permissive — agent code is the validator of record;
  // strict enforcement here would force two new schemas without changing any
  // observable behavior.
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
});

const PromptKind = z.enum(['piv_pin', 'touchid', 'yubikey_otp', 'sso_push']);

// v1.1 frame — schema lands in v1; nothing emits or consumes it until v1.1.
const CommandAwaitingUser = z.object({
  type: z.literal('command_awaiting_user'),
  commandId: z.string().min(1),
  prompt: z.object({
    kind: PromptKind,
    reason: z.string(),
    ttlSec: z.number().int().positive(),
  }),
});

// v1.1 frame — schema lands in v1; nothing emits or consumes it until v1.1.
const CommandUserSatisfied = z.object({
  type: z.literal('command_user_satisfied'),
  commandId: z.string().min(1),
  ok: z.boolean(),
});

export const AgentFrameSchema = z.discriminatedUnion('type', [
  Hello,
  Heartbeat,
  Event,
  CommandAck,
  CommandResult,
  CommandAwaitingUser,
  CommandUserSatisfied,
]);
export type AgentFrame = z.infer<typeof AgentFrameSchema>;

const QueuedCommand = z.object({
  commandId: z.string().min(1),
  kind: z.string().min(1), // namespaced: '<provider>.<verb>'
  args: z.record(z.string(), z.unknown()),
});

const Welcome = z.object({
  type: z.literal('welcome'),
  rev: z.number().int().nonnegative(),
  queuedCommands: z.array(QueuedCommand),
});

const Rejected = z.object({
  type: z.literal('rejected'),
  reason: z.enum(['token_invalid', 'device_revoked', 'workspace_locked']),
});

const Command = z.object({
  type: z.literal('command'),
  commandId: z.string().min(1),
  kind: z.string().min(1), // namespaced
  args: z.record(z.string(), z.unknown()),
});

export const ServerFrameSchema = z.discriminatedUnion('type', [Welcome, Rejected, Command]);
export type ServerFrame = z.infer<typeof ServerFrameSchema>;

export function parseAgentFrame(raw: unknown): AgentFrame {
  return AgentFrameSchema.parse(raw);
}

export function parseServerFrame(raw: unknown): ServerFrame {
  return ServerFrameSchema.parse(raw);
}
