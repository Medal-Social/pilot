// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KitError } from '../errors.js';
import { expandTilde, loadKitConfig } from './load.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'kit-cfg-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('loadKitConfig', () => {
  it('loads config from $KIT_CONFIG path', async () => {
    const path = join(tmp, 'kit.config.json');
    writeFileSync(
      path,
      JSON.stringify({
        name: 'kit',
        repo: 'x',
        repoDir: '/tmp/k',
        machines: { foo: { type: 'darwin', user: 'a' } },
      })
    );
    const cfg = await loadKitConfig({ env: { KIT_CONFIG: path }, home: '/nope' });
    expect(cfg.name).toBe('kit');
  });

  it('falls back to ~/Documents/Code/kit/kit.config.json', async () => {
    const home = mkdtempSync(join(tmpdir(), 'kit-home-'));
    const dir = join(home, 'Documents', 'Code', 'kit');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'kit.config.json'),
      JSON.stringify({
        name: 'kit',
        repo: 'x',
        repoDir: '/tmp/k',
        machines: { foo: { type: 'darwin', user: 'a' } },
      })
    );
    const cfg = await loadKitConfig({ env: {}, home });
    expect(cfg.repoDir).toBe('/tmp/k');
    rmSync(home, { recursive: true, force: true });
  });

  it('uses HOME from injected env (not process.env) when opts.home is absent', async () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'kit-fakehome-'));
    const dir = join(fakeHome, 'Documents', 'Code', 'kit');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'kit.config.json'),
      JSON.stringify({
        name: 'kit',
        repo: 'x',
        machines: { foo: { type: 'darwin', user: 'a' } },
      })
    );
    // Pass HOME via env, NOT opts.home. The loader should honor env.HOME.
    const cfg = await loadKitConfig({ env: { HOME: fakeHome } });
    expect(cfg.configPath).toBe(join(dir, 'kit.config.json'));
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('throws KIT_CONFIG_NOT_FOUND when nothing is found', async () => {
    await expect(loadKitConfig({ env: {}, home: tmp })).rejects.toBeInstanceOf(KitError);
  });

  it('throws KIT_CONFIG_INVALID when JSON cannot be parsed', async () => {
    const path = join(tmp, 'kit.config.json');
    writeFileSync(path, '{ not json');

    await expect(loadKitConfig({ env: { KIT_CONFIG: path }, home: '/nope' })).rejects.toMatchObject(
      { code: 'KIT_CONFIG_INVALID' }
    );
  });

  it('throws KIT_CONFIG_INVALID when config schema validation fails', async () => {
    const path = join(tmp, 'kit.config.json');
    writeFileSync(path, JSON.stringify({ name: 'kit', repo: 'x', machines: {} }));

    await expect(loadKitConfig({ env: { KIT_CONFIG: path }, home: '/nope' })).rejects.toMatchObject(
      { code: 'KIT_CONFIG_INVALID' }
    );
  });

  it('derives repoDir from the config file location when not in the file', async () => {
    const path = join(tmp, 'kit.config.json');
    writeFileSync(
      path,
      JSON.stringify({
        name: 'kit',
        repo: 'x',
        machines: { foo: { type: 'darwin', user: 'a' } },
      })
    );
    const cfg = await loadKitConfig({ env: { KIT_CONFIG: path }, home: '/nope' });
    expect(cfg.repoDir).toBe(tmp);
  });

  it('respects an explicit repoDir override in the file', async () => {
    const path = join(tmp, 'kit.config.json');
    writeFileSync(
      path,
      JSON.stringify({
        name: 'kit',
        repo: 'x',
        repoDir: '/somewhere/else',
        machines: { foo: { type: 'darwin', user: 'a' } },
      })
    );
    const cfg = await loadKitConfig({ env: { KIT_CONFIG: path }, home: '/nope' });
    expect(cfg.repoDir).toBe('/somewhere/else');
  });

  it('expands ~/... in repoDir using the user home directory', async () => {
    const path = join(tmp, 'kit.config.json');
    writeFileSync(
      path,
      JSON.stringify({
        name: 'kit',
        repo: 'x',
        repoDir: '~/some/kit',
        machines: { foo: { type: 'darwin', user: 'a' } },
      })
    );
    const cfg = await loadKitConfig({ env: { KIT_CONFIG: path } });
    expect(cfg.repoDir.startsWith('~')).toBe(false);
    expect(cfg.repoDir).toMatch(/some\/kit$/);
  });

  it('resolves a relative repoDir against the config file directory', async () => {
    const path = join(tmp, 'kit.config.json');
    writeFileSync(
      path,
      JSON.stringify({
        name: 'kit',
        repo: 'x',
        repoDir: 'subdir/kit',
        machines: { foo: { type: 'darwin', user: 'a' } },
      })
    );
    const cfg = await loadKitConfig({ env: { KIT_CONFIG: path }, home: '/nope' });
    expect(cfg.repoDir).toBe(join(tmp, 'subdir/kit'));
  });
});

describe('expandTilde', () => {
  it('expands bare tilde and leaves non-tilde paths unchanged', () => {
    expect(expandTilde('~', '/home/test')).toBe('/home/test');
    expect(expandTilde('/opt/kit', '/home/test')).toBe('/opt/kit');
  });
});
