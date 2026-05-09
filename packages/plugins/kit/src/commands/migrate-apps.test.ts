// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateMachineFile } from './migrate-apps.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mig-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const INLINE = `{ ... }: {
  homebrew.casks = [
    "1password"
    "zed"
    "rectangle"
  ];
  homebrew.brews = [
    "ripgrep"
    "jq"
  ];
}
`;

describe('migrateMachineFile', () => {
  it('extracts inline lists into apps.json and rewrites the .nix', async () => {
    const nixPath = join(dir, 'ali-pro.nix');
    writeFileSync(nixPath, INLINE);
    const result = await migrateMachineFile(nixPath, 'ali-pro');
    expect(result.changed).toBe(true);
    const apps = JSON.parse(readFileSync(join(dir, 'ali-pro.apps.json'), 'utf8'));
    expect(apps.casks).toEqual(['1password', 'rectangle', 'zed']);
    expect(apps.brews).toEqual(['jq', 'ripgrep']);
    expect(readFileSync(nixPath, 'utf8')).toBe(
      `{ ... }: let\n  apps = builtins.fromJSON (builtins.readFile ./ali-pro.apps.json);\nin {\n  homebrew.casks = apps.casks;\n  homebrew.brews = apps.brews;\n}\n`
    );
  });

  it('preserves surrounding config when splicing (real-world shape)', async () => {
    const REAL = `{ hostname, ... }:\n{\n  networking.hostName = "ali-pro";\n  system.primaryUser = "ali";\n\n  users.users.ali = {\n    name = "ali";\n    home = "/Users/ali";\n  };\n\n  homebrew.casks = [\n    "zed"\n    "1password"\n  ];\n\n  homebrew.brews = [\n    "ripgrep"\n  ];\n\n  services.medal-agent.enable = true;\n  system.stateVersion = 5;\n}\n`;
    const nixPath = join(dir, 'ali-pro.nix');
    writeFileSync(nixPath, REAL);
    const result = await migrateMachineFile(nixPath, 'ali-pro');
    expect(result.changed).toBe(true);
    const after = readFileSync(nixPath, 'utf8');
    // Preserves surrounding config:
    expect(after).toContain('networking.hostName = "ali-pro";');
    expect(after).toContain('users.users.ali =');
    expect(after).toContain('services.medal-agent.enable = true;');
    expect(after).toContain('system.stateVersion = 5;');
    // Injects let binding:
    expect(after).toContain(
      'let\n  apps = builtins.fromJSON (builtins.readFile ./ali-pro.apps.json);\nin'
    );
    // Replaces homebrew lists:
    expect(after).toContain('homebrew.casks = apps.casks;');
    expect(after).toContain('homebrew.brews = apps.brews;');
    expect(after).not.toContain('"zed"');
    expect(after).not.toContain('"ripgrep"');
    // apps.json contains the data:
    const apps = JSON.parse(readFileSync(join(dir, 'ali-pro.apps.json'), 'utf8'));
    expect(apps.casks).toEqual(['1password', 'zed']);
    expect(apps.brews).toEqual(['ripgrep']);
  });

  it('is idempotent — re-running on a migrated file does nothing', async () => {
    const nixPath = join(dir, 'ali-pro.nix');
    writeFileSync(
      nixPath,
      `{ ... }: let\n  apps = builtins.fromJSON (builtins.readFile ./ali-pro.apps.json);\nin {\n  homebrew.casks = apps.casks;\n  homebrew.brews = apps.brews;\n}\n`
    );
    writeFileSync(join(dir, 'ali-pro.apps.json'), '{"casks":[],"brews":[]}');
    const result = await migrateMachineFile(nixPath, 'ali-pro');
    expect(result.changed).toBe(false);
  });

  it('appends the apps binding to an existing let block', async () => {
    const nixPath = join(dir, 'ali-pro.nix');
    writeFileSync(
      nixPath,
      `{ ... }: let
  hostname = "ali-pro";
in {
  networking.hostName = hostname;
  homebrew.casks = [
    "zed"
  ];
}
`
    );

    const result = await migrateMachineFile(nixPath, 'ali-pro');

    expect(result.changed).toBe(true);
    expect(readFileSync(nixPath, 'utf8')).toBe(
      `{ ... }: let
  hostname = "ali-pro";
  apps = builtins.fromJSON (builtins.readFile ./ali-pro.apps.json);
in {
  networking.hostName = hostname;
  homebrew.casks = apps.casks;
}
`
    );
    const apps = JSON.parse(readFileSync(join(dir, 'ali-pro.apps.json'), 'utf8'));
    expect(apps).toEqual({ casks: ['zed'], brews: [] });
  });

  it('does nothing when no inline homebrew lists are present', async () => {
    const nixPath = join(dir, 'ali-pro.nix');
    writeFileSync(nixPath, `{ ... }: {\n  networking.hostName = "ali-pro";\n}\n`);

    const result = await migrateMachineFile(nixPath, 'ali-pro');

    expect(result.changed).toBe(false);
    expect(readFileSync(nixPath, 'utf8')).toBe(
      `{ ... }: {\n  networking.hostName = "ali-pro";\n}\n`
    );
  });

  it('throws when inline lists exist but the nix shape cannot be rewritten', async () => {
    const nixPath = join(dir, 'ali-pro.nix');
    writeFileSync(nixPath, `homebrew.casks = [\n  "zed"\n];\n`);

    await expect(migrateMachineFile(nixPath, 'ali-pro')).rejects.toThrow(
      'Could not locate function-to-body transition'
    );
  });
});
