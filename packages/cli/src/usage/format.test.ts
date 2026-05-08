// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatJson, formatTable } from './format.js';
import type { UsageReport } from './types.js';

function makeReport(overrides: Partial<UsageReport> = {}): UsageReport {
  return {
    window: {
      since: new Date('2026-04-22T00:00:00Z'),
      until: new Date('2026-04-22T23:59:59Z'),
      label: 'today',
    },
    project: 'pilot',
    providers: [
      {
        provider: 'claude',
        scope: 'pilot',
        models: [
          {
            model: 'claude-opus-4',
            inputTokens: 12400,
            outputTokens: 3200,
            cacheTokens: 1100,
            costUSD: 0.84,
            costUnknown: false,
          },
        ],
        totalCostUSD: 0.84,
        hasCostUnknown: false,
      },
    ],
    grandTotalCostUSD: 0.84,
    ...overrides,
  };
}

describe('formatTable', () => {
  let written: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    written = '';
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('includes the project name', () => {
    formatTable(makeReport());
    expect(written).toContain('pilot');
  });

  it('includes the time window label', () => {
    formatTable(makeReport());
    expect(written).toContain('today');
  });

  it('includes the model name', () => {
    formatTable(makeReport());
    expect(written).toContain('claude-opus-4');
  });

  it('includes formatted token counts', () => {
    formatTable(makeReport());
    expect(written).toContain('12,400');
    expect(written).toContain('3,200');
  });

  it('includes the cost', () => {
    formatTable(makeReport());
    expect(written).toContain('$0.84');
  });

  it('shows "?" for unknown cost', () => {
    const report = makeReport();
    const provider = report.providers[0];
    const model = provider?.models[0];
    if (provider && model) {
      model.costUnknown = true;
      provider.hasCostUnknown = true;
    }
    formatTable(report);
    expect(written).toContain('?');
  });

  it('shows Grand Total when multiple providers', () => {
    const report = makeReport();
    report.providers.push({
      provider: 'codex',
      scope: 'all sessions',
      models: [
        {
          model: 'gpt-5',
          inputTokens: 5000,
          outputTokens: 2000,
          cacheTokens: 300,
          costUSD: 0.27,
          costUnknown: false,
        },
      ],
      totalCostUSD: 0.27,
      hasCostUnknown: false,
    });
    report.grandTotalCostUSD = 1.11;
    formatTable(report);
    expect(written).toContain('Grand Total');
    expect(written).toContain('$1.11');
  });

  it('includes Codex section label', () => {
    const report = makeReport();
    report.providers.push({
      provider: 'codex',
      scope: 'all sessions',
      models: [
        {
          model: 'gpt-5',
          inputTokens: 1000,
          outputTokens: 500,
          cacheTokens: 0,
          costUSD: 0.09,
          costUnknown: false,
        },
      ],
      totalCostUSD: 0.09,
      hasCostUnknown: false,
    });
    formatTable(report);
    expect(written).toContain('Codex');
    expect(written).toContain('all sessions');
  });
});

describe('formatJson', () => {
  let written: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    written = '';
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('outputs valid JSON', () => {
    formatJson(makeReport());
    expect(() => JSON.parse(written)).not.toThrow();
  });

  it('includes window, project, providers, grandTotalCostUSD', () => {
    formatJson(makeReport());
    const parsed = JSON.parse(written);
    expect(parsed.window).toBe('today');
    expect(parsed.project).toBe('pilot');
    expect(parsed.providers).toBeDefined();
    expect(parsed.grandTotalCostUSD).toBe(0.84);
  });

  it('includes per-model data', () => {
    formatJson(makeReport());
    const parsed = JSON.parse(written);
    expect(parsed.providers.claude.models[0].model).toBe('claude-opus-4');
    expect(parsed.providers.claude.models[0].inputTokens).toBe(12400);
  });

  it('outputs null costUSD for unknown-cost models', () => {
    const report = makeReport();
    const model = report.providers[0]?.models[0];
    if (model) model.costUnknown = true;
    formatJson(report);
    const parsed = JSON.parse(written);
    expect(parsed.providers.claude.models[0].costUSD).toBeNull();
  });

  it('ends with a newline', () => {
    formatJson(makeReport());
    expect(written.endsWith('\n')).toBe(true);
  });

  it('outputs null totalCostUSD for unknown-cost provider', () => {
    const report = makeReport();
    const provider = report.providers[0];
    if (provider) provider.hasCostUnknown = true;
    formatJson(report);
    const parsed = JSON.parse(written);
    expect(parsed.providers.claude.totalCostUSD).toBeNull();
  });
});

describe('formatTable with TTY colors enabled', () => {
  let written: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let isTTYDescriptor: PropertyDescriptor | undefined;
  let previousNoColor: string | undefined;

  beforeEach(() => {
    written = '';
    previousNoColor = process.env.NO_COLOR;
    delete process.env.NO_COLOR;
    isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    if (isTTYDescriptor) {
      Object.defineProperty(process.stdout, 'isTTY', isTTYDescriptor);
    } else {
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    }
    if (previousNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = previousNoColor;
    }
  });

  it('includes ANSI escape codes when TTY is enabled', () => {
    formatTable(makeReport());
    expect(written).toContain('\x1b[');
  });
});
