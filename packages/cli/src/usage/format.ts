// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { ModelBreakdown, ProviderReport, UsageReport } from './types.js';

function isTty(): boolean {
  return (process.stdout.isTTY ?? false) && !process.env.NO_COLOR;
}
const bold = (s: string) => (isTty() ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s: string) => (isTty() ? `\x1b[2m${s}\x1b[0m` : s);
const purple = (s: string) => (isTty() ? `\x1b[35m${s}\x1b[0m` : s);
const teal = (s: string) => (isTty() ? `\x1b[36m${s}\x1b[0m` : s);

const SEP = '─'.repeat(69);

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtCost(cost: number, unknown: boolean): string {
  return unknown ? '?' : `$${cost.toFixed(2)}`;
}

function padR(s: string, w: number): string {
  return s.padStart(w);
}

function padL(s: string, w: number): string {
  return s.padEnd(w);
}

function modelRow(m: ModelBreakdown): string {
  return (
    `  ${padL(m.model, 24)}` +
    `${padR(`${fmtNum(m.inputTokens)} tok`, 14)}` +
    `  ${padR(`${fmtNum(m.outputTokens)} tok`, 14)}` +
    `  ${padR(`${fmtNum(m.cacheTokens)} tok`, 14)}` +
    `  ${padR(fmtCost(m.costUSD, m.costUnknown), 7)}`
  );
}

function providerTotalRow(p: ProviderReport): string {
  const totalInput = p.models.reduce((s, m) => s + m.inputTokens, 0);
  const totalOutput = p.models.reduce((s, m) => s + m.outputTokens, 0);
  const totalCache = p.models.reduce((s, m) => s + m.cacheTokens, 0);
  return (
    `  ${bold(padL('Total', 24))}` +
    `${padR(`${fmtNum(totalInput)} tok`, 14)}` +
    `  ${padR(`${fmtNum(totalOutput)} tok`, 14)}` +
    `  ${padR(`${fmtNum(totalCache)} tok`, 14)}` +
    `  ${bold(padR(fmtCost(p.totalCostUSD, p.hasCostUnknown), 7))}`
  );
}

function headerRow(): string {
  return (
    `  ${dim(padL('Model', 24))}` +
    `${dim(padR('Input', 14))}` +
    `  ${dim(padR('Output', 14))}` +
    `  ${dim(padR('Cache', 14))}` +
    `  ${dim(padR('Cost', 7))}`
  );
}

export function formatTable(report: UsageReport): void {
  const w = process.stdout.write.bind(process.stdout);
  const windowLabel = report.window.label;
  const projectLabel = report.project;

  const spacer = dim(padR(windowLabel, 46 - projectLabel.length));
  w(`\n  ${bold(purple('pilot usage'))}  ${dim('·')}  ${bold(projectLabel)}  ${spacer}\n\n`);

  for (const provider of report.providers) {
    const label = provider.provider === 'claude' ? bold('Claude Code') : bold('Codex');
    const scopeSuffix =
      provider.scope !== projectLabel ? `  ${dim('·')}  ${dim(provider.scope)}` : '';
    w(`  ${label}${scopeSuffix}\n`);
    w(`${headerRow()}\n`);
    w(`  ${dim(SEP)}\n`);
    for (const m of provider.models) {
      w(`${modelRow(m)}\n`);
    }
    w(`${providerTotalRow(provider)}\n\n`);
  }

  if (report.providers.length > 1) {
    const hasUnknown = report.providers.some((p) => p.hasCostUnknown);
    w(
      `  ${bold(padL('Grand Total', 24 + 14 + 2 + 14 + 2 + 14 + 2))}  ${bold(padR(fmtCost(report.grandTotalCostUSD, hasUnknown), 7))}\n`
    );
    w(`  ${dim(SEP)}\n\n`);
  }

  const count = report.providers.length;
  w(
    `  ${teal('●')} ${dim(projectLabel)}  ${dim('·')}  ${dim(`${count} provider${count !== 1 ? 's' : ''}`)}  ${dim('·')}  ${dim(windowLabel)}\n\n`
  );
}

export function formatJson(report: UsageReport): void {
  const output = {
    window: report.window.label,
    since: report.window.since.toISOString().slice(0, 10),
    until: report.window.until.toISOString().slice(0, 10),
    project: report.project,
    providers: Object.fromEntries(
      report.providers.map((p) => [
        p.provider,
        {
          scope: p.scope,
          models: p.models.map((m) => ({
            model: m.model,
            inputTokens: m.inputTokens,
            outputTokens: m.outputTokens,
            cacheTokens: m.cacheTokens,
            costUSD: m.costUnknown ? null : m.costUSD,
          })),
          totalCostUSD: p.hasCostUnknown ? null : p.totalCostUSD,
        },
      ])
    ),
    // Mirror the per-provider null behaviour and the table footer: if any
    // model lacks a known price the partial sum is misleading, so emit null.
    grandTotalCostUSD: report.providers.some((p) => p.hasCostUnknown)
      ? null
      : report.grandTotalCostUSD,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
