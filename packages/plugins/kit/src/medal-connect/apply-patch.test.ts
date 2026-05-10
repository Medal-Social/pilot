// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyKitPatch, type KitPatch } from './apply-patch.js';

let dir: string;
let appsFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mc-patch-'));
  // Use the modern machine-specific layout so the tests reflect the layout
  // production agents see post-`pilot kit update` migration.
  mkdirSync(join(dir, 'machines'));
  appsFile = join(dir, 'machines', 'host.apps.json');
  writeFileSync(appsFile, JSON.stringify({ casks: ['existing'], brews: [] }));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('applyKitPatch', () => {
  it('applies cask.add operations and reports the apps file as mutated', async () => {
    const patch: KitPatch = { ops: [{ kind: 'cask.add', cask: 'spotify' }] };
    const mutated = await applyKitPatch(dir, patch, { appsFilePath: appsFile });
    const apps = JSON.parse(readFileSync(appsFile, 'utf8'));
    expect(apps.casks).toContain('spotify');
    expect(apps.casks).toContain('existing');
    expect(mutated).toEqual(['machines/host.apps.json']);
  });

  it('applies cask.remove operations', async () => {
    const patch: KitPatch = { ops: [{ kind: 'cask.remove', cask: 'existing' }] };
    const mutated = await applyKitPatch(dir, patch, { appsFilePath: appsFile });
    const apps = JSON.parse(readFileSync(appsFile, 'utf8'));
    expect(apps.casks).not.toContain('existing');
    expect(mutated).toEqual(['machines/host.apps.json']);
  });

  it('applies multiple ops in order', async () => {
    const patch: KitPatch = {
      ops: [
        { kind: 'cask.add', cask: 'figma' },
        { kind: 'cask.add', cask: 'raycast' },
        { kind: 'cask.remove', cask: 'existing' },
      ],
    };
    await applyKitPatch(dir, patch, { appsFilePath: appsFile });
    const apps = JSON.parse(readFileSync(appsFile, 'utf8'));
    expect(apps.casks.sort()).toEqual(['figma', 'raycast']);
  });

  it('cask.add is idempotent on duplicates (matches connect cask flow)', async () => {
    const patch: KitPatch = { ops: [{ kind: 'cask.add', cask: 'existing' }] };
    const mutated = await applyKitPatch(dir, patch, { appsFilePath: appsFile });
    const apps = JSON.parse(readFileSync(appsFile, 'utf8'));
    expect(apps.casks).toEqual(['existing']);
    // Still tracked as mutated so commitAndPush stages it (in case a prior
    // attempt left a local commit unpushed).
    expect(mutated).toEqual(['machines/host.apps.json']);
  });

  it('refuses to write to secrets/ paths (spec §11)', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'secrets/oslo-server.yaml', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/secrets/);
  });

  it('refuses Secrets/ (case-insensitive) — macOS default filesystem', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'Secrets/admin.yaml', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/secrets/i);
  });

  it('refuses SECRETS/ uppercase too', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'SECRETS/x', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/secrets/i);
  });

  it('refuses nested secrets/ paths', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'secrets/sub/dir/file.yaml', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/secrets/);
  });

  it('refuses .git/ writes — patch-controlled git internals are forbidden', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: '.git/hooks/pre-commit', content: '#!/bin/sh\nrm -rf /' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/\.git/i);
  });

  it('refuses .Git/ uppercase variant', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: '.Git/config', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/\.git/i);
  });

  it('refuses .medal-connect/ writes (agent-internal state)', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: '.medal-connect/last-rebuild.json', content: '{}' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /medal-connect/i
    );
  });

  it('refuses absolute paths', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: '/etc/secrets/file', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /escape|absolute/i
    );
  });

  it('refuses paths that escape the kit repo dir', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: '../etc/evil', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/escape/);
  });

  it('refuses paths that escape via traversal even if they look local', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'modules/../../etc/evil', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/escape/);
  });

  it('refuses raw.write that targets an existing symlink (would follow & redirect)', async () => {
    // Plant a symlink that pretends to be a regular .nix file but actually
    // points outside the repo. Without the symlink guard, writeFileSync
    // would follow the link and overwrite `/tmp/<x>/redirected-target`.
    const realTarget = mkdtempSync(join(tmpdir(), 'redirect-'));
    writeFileSync(join(realTarget, 'redirected'), 'original');
    mkdirSync(join(dir, 'modules'));
    symlinkSync(join(realTarget, 'redirected'), join(dir, 'modules', 'symlinked.nix'));

    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'modules/symlinked.nix', content: 'pwn' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /symlink/i
    );
    // Verify the redirect target was NOT overwritten.
    expect(readFileSync(join(realTarget, 'redirected'), 'utf8')).toBe('original');
    rmSync(realTarget, { recursive: true, force: true });
  });

  it('refuses raw.write through a symlinked DIRECTORY ancestor', async () => {
    const realDir = mkdtempSync(join(tmpdir(), 'redirect-dir-'));
    symlinkSync(realDir, join(dir, 'evil-dir'));
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'evil-dir/inside.nix', content: 'pwn' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /symlink/i
    );
    rmSync(realDir, { recursive: true, force: true });
  });

  it('writes raw.write content for non-secret paths and reports the path', async () => {
    mkdirSync(join(dir, 'modules', 'platform', 'darwin'), { recursive: true });
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'modules/platform/darwin/fonts.nix', content: '{ }' }],
    };
    const mutated = await applyKitPatch(dir, patch, { appsFilePath: appsFile });
    expect(readFileSync(join(dir, 'modules/platform/darwin/fonts.nix'), 'utf8')).toBe('{ }');
    expect(mutated).toEqual(['modules/platform/darwin/fonts.nix']);
  });

  it('creates parent directories for raw.write', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: 'modules/new/path/file.nix', content: '{ }' }],
    };
    await applyKitPatch(dir, patch, { appsFilePath: appsFile });
    expect(readFileSync(join(dir, 'modules/new/path/file.nix'), 'utf8')).toBe('{ }');
  });

  it('returns a deduped list of mutated paths', async () => {
    const patch: KitPatch = {
      ops: [
        { kind: 'cask.add', cask: 'spotify' },
        { kind: 'raw.write', path: 'modules/x.nix', content: '{}' },
        { kind: 'cask.add', cask: 'figma' },
      ],
    };
    mkdirSync(join(dir, 'modules'), { recursive: true });
    const mutated = await applyKitPatch(dir, patch, { appsFilePath: appsFile });
    expect(mutated.sort()).toEqual(['machines/host.apps.json', 'modules/x.nix']);
  });

  it('throws on unknown op kind', async () => {
    const patch: KitPatch = {
      // @ts-expect-error -- intentionally invalid op kind
      ops: [{ kind: 'totally.bogus', value: 'nope' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /unknown|invalid/i
    );
  });

  it('handles empty ops array gracefully', async () => {
    const mutated = await applyKitPatch(dir, { ops: [] }, { appsFilePath: appsFile });
    expect(mutated).toEqual([]);
    const apps = JSON.parse(readFileSync(appsFile, 'utf8'));
    expect(apps.casks).toEqual(['existing']);
  });
});
