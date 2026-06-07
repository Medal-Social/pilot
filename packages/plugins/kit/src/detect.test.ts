// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { detectMachine } from './detect.js';

describe('detectMachine', () => {
  it('detects ali-mini from hostname containing mini', () => {
    expect(detectMachine('Alis-Mac-mini')).toBe('ali-mini');
  });

  it('detects ali-studio from hostname containing studio', () => {
    expect(detectMachine('ali-studio')).toBe('ali-studio');
  });

  it('detects ali-pro from hostname containing pro', () => {
    expect(detectMachine('Alis-MacBook-Pro')).toBe('ali-pro');
  });

  it('detects ada-air from hostname containing air', () => {
    expect(detectMachine('Adas-MacBook-Air')).toBe('ada-air');
  });

  it('does NOT map a bare "ada" token to ada-air (ambiguous vs ada-ws)', () => {
    // `ada` alone can't disambiguate ada-air (darwin) from ada-ws (linux).
    // It must fall through to null so resolveMachine can use the raw-hostname
    // (zero-config) path for ada-ws.
    expect(detectMachine('ada')).toBeNull();
    expect(detectMachine('ada-ws')).toBeNull();
  });

  it('returns null for unknown hostname', () => {
    expect(detectMachine('random-machine')).toBeNull();
  });

  it('does not match partial segments like production or project', () => {
    expect(detectMachine('production-node')).toBeNull();
    expect(detectMachine('project-box')).toBeNull();
    expect(detectMachine('administrator-pc')).toBeNull();
  });
});
