// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyKitPatch, type KitPatch } from './apply-patch.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mc-patch-'));
  mkdirSync(join(dir, 'apps'));
  writeFileSync(join(dir, 'apps', 'apps.json'), JSON.stringify({ casks: ['existing'], brews: [] }));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('applyKitPatch', () => {
  it('applies cask.add operations', async () => {
    const patch: KitPatch = { ops: [{ kind: 'cask.add', cask: 'spotify' }] };
    await applyKitPatch(dir, patch);
    const apps = JSON.parse(readFileSync(join(dir, 'apps', 'apps.json'), 'utf8'));
    expect(apps.casks).toContain('spotify');
    expect(apps.casks).toContain('existing');
  });

  it('applies cask.remove operations', async () => {
    const patch: KitPatch = { ops: [{ kind: 'cask.remove', cask: 'existing' }] };
    await applyKitPatch(dir, patch);
    const apps = JSON.parse(readFileSync(join(dir, 'apps', 'apps.json'), 'utf8'));
    expect(apps.casks).not.toContain('existing');
  });

  it('applies multiple ops in order', async () => {
    const patch: KitPatch = {
      ops: [
        { kind: 'cask.add', cask: 'figma' },
        { kind: 'cask.add', cask: 'raycast' },
        { kind: 'cask.remove', cask: 'existing' },
      ],
    };
    await applyKitPatch(dir, patch);
    const apps = JSON.parse(readFileSync(join(dir, 'apps', 'apps.json'), 'utf8'));
    expect(apps.casks.sort()).toEqual(['figma', 'raycast']);
  });

  it('refuses to write to secrets/ paths (spec §11)', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'secrets/oslo-server.yaml', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch)).rejects.toThrow(/secrets/);
  });

  it('refuses nested secrets/ paths', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'secrets/sub/dir/file.yaml', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch)).rejects.toThrow(/secrets/);
  });

  it('refuses absolute paths to secrets', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: '/etc/secrets/file', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch)).rejects.toThrow(/escape|secrets/);
  });

  it('refuses paths that escape the kit repo dir', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: '../etc/evil', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch)).rejects.toThrow(/escape/);
  });

  it('refuses paths that escape via traversal even if they look local', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'modules/../../etc/evil', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch)).rejects.toThrow(/escape/);
  });

  it('writes raw.write content for non-secret paths', async () => {
    mkdirSync(join(dir, 'modules', 'platform', 'darwin'), { recursive: true });
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'modules/platform/darwin/fonts.nix', content: '{ }' }],
    };
    await applyKitPatch(dir, patch);
    expect(readFileSync(join(dir, 'modules/platform/darwin/fonts.nix'), 'utf8')).toBe('{ }');
  });

  it('creates parent directories for raw.write', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'modules/new/path/file.nix', content: '{ }' }],
    };
    await applyKitPatch(dir, patch);
    expect(readFileSync(join(dir, 'modules/new/path/file.nix'), 'utf8')).toBe('{ }');
  });

  it('throws on duplicate cask.add', async () => {
    const patch: KitPatch = { ops: [{ kind: 'cask.add', cask: 'existing' }] };
    await expect(applyKitPatch(dir, patch)).rejects.toThrow(/already/i);
  });

  it('throws on unknown op kind', async () => {
    const patch: KitPatch = {
      // @ts-expect-error -- intentionally invalid op kind
      ops: [{ kind: 'totally.bogus', value: 'nope' }],
    };
    await expect(applyKitPatch(dir, patch)).rejects.toThrow(/unknown|invalid/i);
  });

  it('handles empty ops array gracefully', async () => {
    await applyKitPatch(dir, { ops: [] });
    // No change; original state intact.
    const apps = JSON.parse(readFileSync(join(dir, 'apps', 'apps.json'), 'utf8'));
    expect(apps.casks).toEqual(['existing']);
  });
});
