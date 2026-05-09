// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { StepRow } from './StepRow.js';

describe('<StepRow />', () => {
  it.each([
    ['ok' as const, '✓'],
    ['running' as const, '⠸'],
    ['pending' as const, '○'],
    ['error' as const, '✗'],
  ])('renders %s glyph', (status, glyph) => {
    const { lastFrame } = render(<StepRow status={status} label="Nix" detail="installed" />);
    expect(lastFrame()).toContain(glyph);
    expect(lastFrame()).toContain('Nix');
  });

  it('omits detail text when detail is absent', () => {
    const { lastFrame } = render(<StepRow status="pending" label="Nix" />);

    expect(lastFrame()).toContain('Nix');
    expect(lastFrame()).not.toContain('installed');
  });
});
