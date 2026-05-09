// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner.js';

describe('<Spinner />', () => {
  it('renders the label', () => {
    const { lastFrame } = render(<Spinner label="Building toolchain" />);
    expect(lastFrame()).toContain('Building toolchain');
  });

  it('renders the elapsed seconds when provided', () => {
    const { lastFrame } = render(<Spinner label="Working" elapsedSeconds={62} />);
    expect(lastFrame()).toContain('1m 02s');
  });

  it('renders seconds, details, and wraps frame indexes', () => {
    const { lastFrame } = render(
      <Spinner label="Working" elapsedSeconds={5} detail="fetching" frame={11} />
    );
    expect(lastFrame()).toContain('5s');
    expect(lastFrame()).toContain('fetching');
    expect(lastFrame()).toContain('⠙');
  });
});
