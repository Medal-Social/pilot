// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { kitConfigSchema } from './schema.js';

describe('kitConfigSchema', () => {
  it('accepts a valid Medal-Social-style config', () => {
    const valid = {
      name: 'kit',
      repo: 'git@github.com:Medal-Social/kit.git',
      repoDir: '~/Documents/Code/kit',
      machines: {
        'ali-pro': { type: 'darwin', user: 'ali' },
        'oslo-server': { type: 'nixos', user: 'ali' },
      },
    };
    expect(() => kitConfigSchema.parse(valid)).not.toThrow();
  });

  it('accepts linux (non-NixOS systemd Linux via system-manager)', () => {
    const valid = {
      name: 'kit',
      repo: 'git@github.com:example/kit.git',
      machines: {
        'my-vm': { type: 'linux', user: 'alice' },
      },
    };
    expect(() => kitConfigSchema.parse(valid)).not.toThrow();
  });

  it('rejects an unknown machine type', () => {
    const invalid = {
      name: 'kit',
      repo: 'x',
      repoDir: '/tmp',
      machines: { foo: { type: 'windows', user: 'a' } },
    };
    expect(() => kitConfigSchema.parse(invalid)).toThrow();
  });

  it('rejects empty machines map', () => {
    const invalid = { name: 'kit', repo: 'x', repoDir: '/tmp', machines: {} };
    expect(() => kitConfigSchema.parse(invalid)).toThrow();
  });
});
