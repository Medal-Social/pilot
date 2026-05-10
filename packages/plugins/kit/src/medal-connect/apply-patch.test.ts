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
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/symlink/i);
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
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/symlink/i);
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

  it('rejects raw.write with empty path string', async () => {
    const patch: KitPatch = {
      ops: [{ kind: 'raw.write', path: '', content: 'x' }],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /invalid path/i
    );
  });

  it('rejects raw.write with non-string content', async () => {
    const patch: KitPatch = {
      ops: [
        // @ts-expect-error -- intentionally invalid content type
        { kind: 'raw.write', path: 'modules/x.nix', content: 42 },
      ],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /content must be a string/i
    );
  });

  it('rethrows non-duplicate cask.add errors (e.g. corrupt apps.json)', async () => {
    // Plant a malformed apps file that addApp's loader will reject. The
    // resulting error is NOT KIT_APPS_DUPLICATE, so applyKitPatch must
    // bubble it up rather than swallow.
    writeFileSync(appsFile, '{not valid json');
    const patch: KitPatch = { ops: [{ kind: 'cask.add', cask: 'spotify' }] };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow();
  });

  it('rethrows non-duplicate cask.remove errors', async () => {
    writeFileSync(appsFile, '{not valid json');
    const patch: KitPatch = { ops: [{ kind: 'cask.remove', cask: 'spotify' }] };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow();
  });

  it('preflights all ops before mutating — partial application is impossible (Codex P2)', async () => {
    // The previous version applied ops in order, so a valid raw.write
    // followed by a forbidden raw.write to secrets/ would have left the
    // first file on disk before throwing on the second. The two-phase
    // applyKitPatch validates everything first; the kit repo must remain
    // untouched when ANY op in the patch is forbidden.
    mkdirSync(join(dir, 'modules'));
    const patch: KitPatch = {
      ops: [
        { kind: 'raw.write', path: 'modules/legit.nix', content: '{ }' },
        { kind: 'raw.write', path: 'secrets/oslo.yaml', content: 'BOGUS' },
      ],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/secrets/);
    // Verify the legit-looking file was NEVER created (preflight rejected
    // the whole patch before phase 2 began).
    expect(() => readFileSync(join(dir, 'modules/legit.nix'), 'utf8')).toThrow();
  });

  it('rejects raw.write under a non-directory ancestor (README.md/x.nix)', async () => {
    // A patch that would try to write under a regular file ancestor would
    // fail mid-application with ENOTDIR after a prior op already mutated
    // the apps file. Preflight catches it (Codex P2 sweep #5).
    writeFileSync(join(dir, 'README.md'), '# kit');
    const patch: KitPatch = {
      ops: [
        { kind: 'cask.add', cask: 'spotify' },
        { kind: 'raw.write', path: 'README.md/inside.nix', content: '{ }' },
      ],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /non-directory/i
    );
    // apps.json must be unchanged.
    const apps = JSON.parse(readFileSync(appsFile, 'utf8'));
    expect(apps.casks).toEqual(['existing']);
  });

  it('rejects raw.write whose leaf is an existing directory (EISDIR pre-empt)', async () => {
    // raw.write to an existing directory would fail at writeFileSync
    // with EISDIR, again leaving the kit repo dirty if a prior op wrote.
    mkdirSync(join(dir, 'modules'), { recursive: true });
    const patch: KitPatch = {
      ops: [
        { kind: 'cask.add', cask: 'spotify' },
        { kind: 'raw.write', path: 'modules', content: '{ }' },
      ],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /existing directory/i
    );
    const apps = JSON.parse(readFileSync(appsFile, 'utf8'));
    expect(apps.casks).toEqual(['existing']);
  });

  it('preflights cask name shape (HOMEBREW_NAME) — invalid name rejects whole patch', async () => {
    // Earlier preflight only rejected empty strings; addApp would have
    // thrown KIT_APPS_INVALID_NAME on a name like 'bad name' (with a
    // space) AFTER the previous valid op had already mutated the apps
    // file (Codex P2 sweep). Now preflight catches it.
    const patch: KitPatch = {
      ops: [
        { kind: 'cask.add', cask: 'spotify' },
        { kind: 'cask.add', cask: 'bad name' },
      ],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /homebrew|invalid/i
    );
    // Verify the apps file is unchanged from the seed (spotify NOT added).
    const apps = JSON.parse(readFileSync(appsFile, 'utf8'));
    expect(apps.casks).toEqual(['existing']);
  });

  it('preflights cask ops too — bad cask name short-circuits before any disk write', async () => {
    mkdirSync(join(dir, 'modules'));
    const patch: KitPatch = {
      ops: [
        { kind: 'raw.write', path: 'modules/before.nix', content: '{ }' },
        // Empty cask string → preflight rejects before phase 2.
        { kind: 'cask.add', cask: '' },
      ],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(/cask/i);
    expect(() => readFileSync(join(dir, 'modules/before.nix'), 'utf8')).toThrow();
  });

  it('rejects raw.write path-prefix conflicts (Codex P2 sweep #4 — file/dir collision)', async () => {
    // A patch with two raw.write ops where one path is a path-segment
    // ancestor of the other is unsafe: `modules` as a file plus
    // `modules/x.nix` as another file would either fail with
    // EEXIST/ENOTDIR mid-application (leaving the kit dirty) or be a
    // vector for surprising file/dir conflicts. Preflight rejects before
    // any filesystem writes.
    const patch: KitPatch = {
      ops: [
        { kind: 'raw.write', path: 'modules', content: '{ }' },
        { kind: 'raw.write', path: 'modules/x.nix', content: '{ }' },
      ],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /prefix|conflict|ancestor/i
    );
    // Neither write happened.
    expect(() => readFileSync(join(dir, 'modules'), 'utf8')).toThrow();
    expect(() => readFileSync(join(dir, 'modules/x.nix'), 'utf8')).toThrow();
  });

  it('rejects raw.write path-prefix conflict regardless of order', async () => {
    // Order-independent: deeper path first, then ancestor file.
    const patch: KitPatch = {
      ops: [
        { kind: 'raw.write', path: 'a/b/c.nix', content: '{ }' },
        { kind: 'raw.write', path: 'a/b', content: '{ }' },
      ],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /prefix|conflict|ancestor/i
    );
  });

  it('rejects raw.write duplicate path conflict (same path twice)', async () => {
    // Two writes to the exact same path is also ambiguous — last-wins is
    // surprising and likely a bug in the patch generator. Reject preflight.
    const patch: KitPatch = {
      ops: [
        { kind: 'raw.write', path: 'modules/x.nix', content: 'one' },
        { kind: 'raw.write', path: 'modules/x.nix', content: 'two' },
      ],
    };
    await expect(applyKitPatch(dir, patch, { appsFilePath: appsFile })).rejects.toThrow(
      /duplicate|conflict|prefix/i
    );
  });

  it('does NOT reject raw.write paths that share a prefix string but not a path-segment ancestor', async () => {
    // `modules` and `modules2/x.nix` share the prefix string "modules"
    // but `modules2` is NOT a path-segment descendant of `modules`. Both
    // writes must succeed (no false positive on substring prefix).
    mkdirSync(join(dir, 'modules2'), { recursive: true });
    const patch: KitPatch = {
      ops: [
        { kind: 'raw.write', path: 'foo.nix', content: '{ }' },
        { kind: 'raw.write', path: 'foo-bar.nix', content: '{ }' },
      ],
    };
    const mutated = await applyKitPatch(dir, patch, { appsFilePath: appsFile });
    expect(mutated.sort()).toEqual(['foo-bar.nix', 'foo.nix']);
  });

  it('allows multiple raw.write ops in the same directory (sibling files, no ancestor overlap)', async () => {
    mkdirSync(join(dir, 'modules'), { recursive: true });
    const patch: KitPatch = {
      ops: [
        { kind: 'raw.write', path: 'modules/a.nix', content: '{ a = true; }' },
        { kind: 'raw.write', path: 'modules/b.nix', content: '{ b = true; }' },
      ],
    };
    const mutated = await applyKitPatch(dir, patch, { appsFilePath: appsFile });
    expect(mutated.sort()).toEqual(['modules/a.nix', 'modules/b.nix']);
    expect(readFileSync(join(dir, 'modules/a.nix'), 'utf8')).toBe('{ a = true; }');
    expect(readFileSync(join(dir, 'modules/b.nix'), 'utf8')).toBe('{ b = true; }');
  });
});
