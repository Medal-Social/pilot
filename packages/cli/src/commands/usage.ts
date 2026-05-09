// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { basename } from 'node:path';
import { errorCodes, PilotError } from '../errors.js';
import { groupByModel } from '../usage/aggregate.js';
import { formatJson, formatTable } from '../usage/format.js';
import { findClaudeProjectDir, readClaudeEntries, readCodexEntries } from '../usage/reader.js';
import type { ProviderReport, UsageReport, UsageWindow } from '../usage/types.js';

export interface UsageOptions {
  week?: boolean;
  month?: boolean;
  since?: string;
  json?: boolean;
}

function buildWindow(opts: UsageOptions): UsageWindow {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86_400_000 - 1);

  if (opts.since) {
    if (!/^\d{8}$/.test(opts.since)) {
      throw new PilotError(errorCodes.USAGE_INVALID_SINCE, opts.since);
    }
    const y = Number.parseInt(opts.since.slice(0, 4), 10);
    const m = Number.parseInt(opts.since.slice(4, 6), 10) - 1;
    const d = Number.parseInt(opts.since.slice(6, 8), 10);
    return { since: new Date(y, m, d), until: todayEnd, label: `since ${opts.since}` };
  }
  if (opts.month) {
    const since = new Date(now.getFullYear(), now.getMonth(), 1);
    return { since, until: todayEnd, label: 'this month' };
  }
  if (opts.week) {
    const since = new Date(todayStart.getTime() - 6 * 86_400_000);
    return { since, until: todayEnd, label: 'last 7 days' };
  }
  return { since: todayStart, until: todayEnd, label: 'today' };
}

export async function runUsage(opts: UsageOptions = {}): Promise<void> {
  const window = buildWindow(opts);
  const cwd = process.cwd();
  const projectDir = findClaudeProjectDir(cwd);
  const projectName = basename(cwd) || 'unknown';

  const providers: ProviderReport[] = [];

  if (projectDir) {
    const entries = await readClaudeEntries(projectDir, window);
    const models = groupByModel(entries);
    if (models.length > 0) {
      providers.push({
        provider: 'claude',
        scope: projectName,
        models,
        totalCostUSD: models.reduce((s, m) => s + m.costUSD, 0),
        hasCostUnknown: models.some((m) => m.costUnknown),
      });
    }
  }

  const codexEntries = await readCodexEntries(window, cwd);
  const codexModels = groupByModel(codexEntries);
  if (codexModels.length > 0) {
    providers.push({
      provider: 'codex',
      scope: projectName,
      models: codexModels,
      totalCostUSD: codexModels.reduce((s, m) => s + m.costUSD, 0),
      hasCostUnknown: codexModels.some((m) => m.costUnknown),
    });
  }

  const report: UsageReport = {
    window,
    project: projectName,
    providers,
    grandTotalCostUSD: providers.reduce((s, p) => s + p.totalCostUSD, 0),
  };

  if (providers.length === 0) {
    if (opts.json) {
      process.stdout.write(
        `${JSON.stringify({ error: 'No usage data found', project: projectName, window: window.label }, null, 2)}\n`
      );
    } else {
      process.stdout.write(`\n  No usage data found for "${projectName}" in this period.\n\n`);
    }
    return;
  }

  if (opts.json) {
    formatJson(report);
    return;
  }

  formatTable(report);
}
