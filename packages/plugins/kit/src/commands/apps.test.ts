// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KitError } from '../errors.js';
import { addApp, listApps, removeApp } from './apps.js';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'apps-cmd-'));
  path = join(dir, 'apps.json');
  writeFileSync(path, JSON.stringify({ casks: ['zed'], brews: [] }));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('apps command', () => {
  it('addApp inserts a new cask', async () => {
    await addApp(path, '1password');
    expect(listApps(path).casks).toEqual(['1password', 'zed']);
  });

  it('addApp inserts a new brew when requested', async () => {
    await addApp(path, 'ripgrep', 'brews');
    expect(listApps(path).brews).toEqual(['ripgrep']);
  });

  it('addApp throws KIT_APPS_DUPLICATE on duplicate entries', async () => {
    await expect(addApp(path, 'zed')).rejects.toMatchObject({
      code: 'KIT_APPS_DUPLICATE',
      cause: 'zed',
    });
  });

  it('addApp reports duplicate details for brew entries', async () => {
    await addApp(path, 'ripgrep', 'brews');

    await expect(addApp(path, 'ripgrep', 'brews')).rejects.toMatchObject({
      code: 'KIT_APPS_DUPLICATE',
      cause: 'ripgrep',
    });
  });

  it('addApp throws KIT_APPS_INVALID_NAME on bad name', async () => {
    await expect(addApp(path, 'has space')).rejects.toBeInstanceOf(KitError);
  });

  it('removeApp removes a cask', async () => {
    await removeApp(path, 'zed');
    expect(listApps(path).casks).toEqual([]);
  });

  it('removeApp leaves other app kinds untouched', async () => {
    await addApp(path, 'ripgrep', 'brews');
    await removeApp(path, 'zed');
    expect(listApps(path)).toEqual({ casks: [], brews: ['ripgrep'] });
  });
});
