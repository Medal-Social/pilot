// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Dirent } from 'node:fs';
import { createReadStream, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { createInterface } from 'node:readline';
import { computeCodexCost } from './pricing.js';
import type { UsageEntry, UsageWindow } from './types.js';

function claudeBasePaths(): string[] {
  const envVar = process.env.CLAUDE_CONFIG_DIR;
  if (envVar) {
    return envVar.split(',').map((p) => join(p.trim(), 'projects'));
  }
  const home = homedir();
  return [join(home, '.config', 'claude', 'projects'), join(home, '.claude', 'projects')];
}

export function findClaudeProjectDir(cwd: string): string | null {
  const encoded = cwd.replace(/[\\/]/g, '-');
  for (const base of claudeBasePaths()) {
    const candidate = join(base, encoded);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function globJsonl(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await globJsonl(full)));
    } else if (entry.name.endsWith('.jsonl')) {
      results.push(full);
    }
  }
  return results;
}

async function readJsonlLines(filePath: string): Promise<string[]> {
  const lines: string[] = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) lines.push(trimmed);
  }
  return lines;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function asNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function findSessionMeta(lines: string[]): Record<string, unknown> | null {
  const first = lines[0];
  if (!first) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(first);
  } catch {
    return null;
  }
  if (!isObj(parsed)) return null;
  if (parsed.type !== 'session_meta') return null;
  return parsed;
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export async function readClaudeEntries(
  projectDir: string,
  window: UsageWindow
): Promise<UsageEntry[]> {
  const files = await globJsonl(projectDir);
  const seen = new Set<string>();
  const entries: UsageEntry[] = [];

  for (const file of files) {
    const lines = await readJsonlLines(file);
    for (const line of lines) {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isObj(raw)) continue;
      if (raw.isApiErrorMessage === true) continue;

      const msg = raw.message;
      if (!isObj(msg)) continue;
      const usage = msg.usage;
      if (!isObj(usage)) continue;

      const messageId = typeof msg.id === 'string' ? msg.id : '';
      const requestId = typeof raw.requestId === 'string' ? raw.requestId : '';
      const key = `${messageId}:${requestId}`;
      if (messageId && seen.has(key)) continue;
      if (messageId) seen.add(key);

      const tsRaw = raw.timestamp;
      if (typeof tsRaw !== 'string') continue;
      const timestamp = new Date(tsRaw);
      if (Number.isNaN(timestamp.getTime())) continue;
      if (timestamp < window.since || timestamp > window.until) continue;

      const model = typeof msg.model === 'string' ? msg.model : 'unknown';
      const costUSDRaw = raw.costUSD;
      const costKnown = typeof costUSDRaw === 'number';
      const costUSD = costKnown ? costUSDRaw : 0;

      entries.push({
        timestamp,
        model,
        inputTokens: asNum(usage.input_tokens),
        outputTokens: asNum(usage.output_tokens),
        cacheCreationTokens: asNum(usage.cache_creation_input_tokens),
        cacheReadTokens: asNum(usage.cache_read_input_tokens),
        costUSD,
        costKnown,
        provider: 'claude',
      });
    }
  }

  return entries;
}

export async function readCodexEntries(
  window: UsageWindow,
  projectDir: string | null = null
): Promise<UsageEntry[]> {
  const codexHome = process.env.CODEX_HOME;
  const sessionsDir = codexHome
    ? join(codexHome, 'sessions')
    : join(homedir(), '.codex', 'sessions');

  const files = await globJsonl(sessionsDir);
  const entries: UsageEntry[] = [];

  for (const file of files) {
    const lines = await readJsonlLines(file);
    if (projectDir) {
      const meta = findSessionMeta(lines);
      const payload = isObj(meta?.payload) ? meta.payload : null;
      const sessionCwd = payload && typeof payload.cwd === 'string' ? payload.cwd : null;
      if (!sessionCwd || !isWithin(projectDir, sessionCwd)) continue;
    }
    let currentModel = 'gpt-5';
    let prevInput = 0;
    let prevCachedInput = 0;
    let prevOutput = 0;

    for (const line of lines) {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isObj(raw)) continue;

      const tsRaw = raw.timestamp;
      const timestamp = typeof tsRaw === 'string' ? new Date(tsRaw) : new Date(0);
      if (Number.isNaN(timestamp.getTime())) continue;

      const type = raw.type;

      if (type === 'turn_context') {
        const payload = raw.payload;
        if (isObj(payload) && typeof payload.model === 'string') {
          currentModel = payload.model;
        }
        continue;
      }

      if (type === 'event_msg') {
        const payload = raw.payload;
        if (!isObj(payload) || payload.type !== 'token_count') continue;
        const info = payload.info;
        if (!isObj(info)) continue;
        const usage = info.total_token_usage;
        if (!isObj(usage)) continue;

        const currInput = asNum(usage.input_tokens);
        const currCached = asNum(usage.cached_input_tokens);
        const currOutput = asNum(usage.output_tokens);

        const deltaInput = Math.max(currInput - prevInput, 0);
        const deltaCached = Math.max(currCached - prevCachedInput, 0);
        const deltaOutput = Math.max(currOutput - prevOutput, 0);

        prevInput = currInput;
        prevCachedInput = currCached;
        prevOutput = currOutput;

        if (deltaInput + deltaCached + deltaOutput === 0) continue;
        if (timestamp < window.since || timestamp > window.until) continue;

        const costResult = computeCodexCost(currentModel, deltaInput, deltaCached, deltaOutput);
        entries.push({
          timestamp,
          model: currentModel,
          inputTokens: deltaInput,
          outputTokens: deltaOutput,
          cacheCreationTokens: 0,
          cacheReadTokens: deltaCached,
          costUSD: costResult ?? 0,
          costKnown: costResult !== null,
          provider: 'codex',
        });
      }
    }
  }

  return entries;
}
