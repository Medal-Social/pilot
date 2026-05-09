// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { Completion } from './Completion.js';

describe('<Completion />', () => {
  it('renders success state', () => {
    const { lastFrame } = render(<Completion ok machine="ali-pro" elapsedSeconds={120} />);
    expect(lastFrame()).toContain('ali-pro is ready');
    expect(lastFrame()).toContain('2m 00s');
  });

  it('renders error state with message', () => {
    const { lastFrame } = render(
      <Completion ok={false} machine="ali-pro" elapsedSeconds={5} error="rebuild failed" />
    );
    expect(lastFrame()).toMatch(/failed/i);
    expect(lastFrame()).toContain('rebuild failed');
  });

  it('renders error state without an optional message', () => {
    const { lastFrame } = render(<Completion ok={false} machine="ali-pro" elapsedSeconds={65} />);

    expect(lastFrame()).toMatch(/failed/i);
    expect(lastFrame()).toContain('1m 05s');
  });
});
