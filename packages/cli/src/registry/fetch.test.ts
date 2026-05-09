// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUNDLED_REGISTRY } from './bundled.js';
import { fetchRegistry } from './fetch.js';
import type { RegistryIndex } from './types.js';

function makeIndex(templates: RegistryIndex['templates'] = []): RegistryIndex {
  return {
    version: 1,
    publishedAt: '2026-04-21T00:00:00Z',
    sha256: createHash('sha256').update(JSON.stringify(templates)).digest('hex'),
    templates,
  };
}

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'pilot-registry-'));
});
afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('fetchRegistry', () => {
  it('returns remote index when fetch succeeds and sha256 matches', async () => {
    const index = makeIndex([]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(index) })
    );
    const result = await fetchRegistry({ cacheDir });
    expect(result.index.version).toBe(1);
    expect(result.fromCache).toBe(false);
    expect(result.offline).toBe(false);
  });

  it('throws UP_REGISTRY_TAMPERED when sha256 mismatches', async () => {
    const index = { ...makeIndex([]), sha256: 'bad' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(index) })
    );
    await expect(fetchRegistry({ cacheDir })).rejects.toMatchObject({
      code: 'UP_REGISTRY_TAMPERED',
    });
  });

  it('returns fresh cache when within TTL', async () => {
    const index = makeIndex([]);
    const cacheFile = join(cacheDir, 'index.json');
    writeFileSync(cacheFile, JSON.stringify({ ...index, cachedAt: Date.now() }));
    const result = await fetchRegistry({ cacheDir, ttlMs: 3_600_000 });
    expect(result.fromCache).toBe(true);
  });

  it('falls back to stale cache when fetch fails', async () => {
    const index = makeIndex([]);
    const cacheFile = join(cacheDir, 'index.json');
    writeFileSync(cacheFile, JSON.stringify({ ...index, cachedAt: 0 })); // expired
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await fetchRegistry({ cacheDir });
    expect(result.fromCache).toBe(true);
    expect(result.offline).toBe(true);
  });

  it('re-fetches when cache is within TTL but sha256 is tampered', async () => {
    const index = makeIndex([]);
    const cacheFile = join(cacheDir, 'index.json');
    writeFileSync(
      cacheFile,
      JSON.stringify({ ...index, sha256: 'tampered', cachedAt: Date.now() })
    );
    const fresh = makeIndex([]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fresh) })
    );
    const result = await fetchRegistry({ cacheDir, ttlMs: 3_600_000 });
    expect(result.fromCache).toBe(false);
  });

  it('re-fetches when cache JSON cannot be parsed', async () => {
    const cacheFile = join(cacheDir, 'index.json');
    writeFileSync(cacheFile, '{ not json');
    const fresh = makeIndex([]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fresh) })
    );

    const result = await fetchRegistry({ cacheDir, ttlMs: 3_600_000 });

    expect(result.fromCache).toBe(false);
    expect(result.offline).toBe(false);
  });

  it('falls back to bundled registry when HTTP fetch fails without cache', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) })
    );

    const result = await fetchRegistry({ cacheDir });

    expect(result.offline).toBe(true);
    expect(result.index.templates).toEqual(BUNDLED_REGISTRY.templates);
  });

  it('returns bundled fallback when offline with no cache', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await fetchRegistry({ cacheDir });
    expect(result.offline).toBe(true);
    expect(result.index.templates).toEqual(BUNDLED_REGISTRY.templates);
  });
});
