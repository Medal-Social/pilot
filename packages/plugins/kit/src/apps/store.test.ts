// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KitError } from '../errors.js';
import { loadAppsJson, writeAppsJson } from './store.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'apps-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('loadAppsJson', () => {
  it('parses a valid apps.json', () => {
    const path = join(dir, 'apps.json');
    writeFileSync(path, JSON.stringify({ casks: ['zed'], brews: ['jq'] }));
    expect(loadAppsJson(path).casks).toEqual(['zed']);
  });

  it('throws KIT_APPS_CORRUPT on malformed JSON', () => {
    const path = join(dir, 'apps.json');
    writeFileSync(path, '{ not json');
    expect(() => loadAppsJson(path)).toThrow(KitError);
  });

  it('throws KIT_APPS_CORRUPT when the file cannot be read', () => {
    expect(() => loadAppsJson(join(dir, 'missing.apps.json'))).toThrow(KitError);
  });

  it('throws KIT_APPS_CORRUPT when the schema is invalid', () => {
    const path = join(dir, 'apps.json');
    writeFileSync(path, JSON.stringify({ casks: ['zed'], brews: ['not valid name'] }));

    expect(() => loadAppsJson(path)).toThrow(KitError);
  });
});

describe('writeAppsJson', () => {
  it('writes atomically and pretty-prints', () => {
    const path = join(dir, 'apps.json');
    writeAppsJson(path, { casks: ['zed', '1password'], brews: [] });
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('"zed"');
    expect(content.endsWith('\n')).toBe(true);
  });
});
