// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, statSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  addApp,
  configCandidates,
  deleteTargets,
  detectMachine,
  errorCodes,
  formatBytes,
  KitError,
  type LoadedKitConfig,
  listApps,
  loadKitConfig,
  realExec,
  realSudoKeeper,
  removeApp,
  renderStatus,
  resolveProvider,
  runEdit,
  runInit,
  runUpdate,
  scaffoldKit,
  scanTargets,
} from '@medalsocial/kit';
import { render, Text } from 'ink';
import React from 'react';
import { colors } from '../colors.js';

function fail(err: unknown): never {
  if (err instanceof KitError) {
    console.error(`${err.message}${err.cause ? `\n${String(err.cause)}` : ''}`);
    process.exit(1);
  }
  throw err;
}

/**
 * Pick a machine name from the config:
 *  1. explicit override (CLI arg or env)
 *  2. auto-detected hostname IF that name is in the config
 *  3. first machine in the config
 *
 * Throws if the override or detection produced a name that isn't configured —
 * we don't want to silently operate against an unrelated machine.
 */
function resolveMachine(config: LoadedKitConfig, override?: string): string {
  const known = Object.keys(config.machines);
  if (known.length === 0) {
    console.error('kit.config.json has no machines configured.');
    process.exit(1);
  }

  if (override) {
    if (!config.machines[override]) {
      console.error(
        `Unknown machine: "${override}". Configured machines: ${known.join(', ')}.\n` +
          `Add it to kit.config.json → machines, or pass one of the configured names.`
      );
      process.exit(1);
    }
    return override;
  }

  const detected = detectMachine(hostname());
  if (detected && config.machines[detected]) return detected;

  // Detection produced something not in this config (or nothing at all). Fall back to first
  // configured machine — but tell the user, since they might be on the wrong machine entirely.
  const fallback = known[0];
  if (detected && !config.machines[detected]) {
    console.error(
      `Hostname suggests "${detected}" but that's not in kit.config.json. ` +
        `Falling back to "${fallback}". Pass an explicit machine name to override.`
    );
  }
  return fallback;
}

function findMachineFile(machinesDir: string, machine: string): string | null {
  const target = `${machine}.apps.json`;
  let entries: string[];
  try {
    entries = readdirSync(machinesDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(machinesDir, entry);
    if (entry === target) return full;
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      const found = findMachineFile(full, machine);
      if (found) return found;
    }
  }
  return null;
}

function findMachineNix(machinesDir: string, machine: string): string | null {
  const target = `${machine}.nix`;
  let entries: string[];
  try {
    entries = readdirSync(machinesDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(machinesDir, entry);
    if (entry === target) return full;
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      const found = findMachineNix(full, machine);
      if (found) return found;
    }
  }
  return null;
}

function machineFile(repoDir: string, machine: string): string {
  const found = findMachineFile(join(repoDir, 'machines'), machine);
  if (found) return found;
  // Fall back to the conventional path so error messages are informative.
  return join(repoDir, 'machines', `${machine}.apps.json`);
}

/**
 * Parse a `kit apps` package argument. Accepts:
 *   - `cask:NAME`   → casks
 *   - `brew:NAME`   → brews
 *   - `NAME`        → casks (default, matches Homebrew CLI convention)
 */
export function parseAppsTarget(arg: string): { kind: 'casks' | 'brews'; name: string } {
  if (arg.startsWith('brew:')) return { kind: 'brews', name: arg.slice(5) };
  if (arg.startsWith('cask:')) return { kind: 'casks', name: arg.slice(5) };
  return { kind: 'casks', name: arg };
}

export async function runKitInit(machineArg?: string): Promise<void> {
  try {
    const config = await loadKitConfig();
    const machine = resolveMachine(config, machineArg);
    const m = config.machines[machine];
    await runInit({
      machine,
      machineType: m.type,
      kitRepoDir: config.repoDir,
      kitRepoUrl: config.repo,
      provider: resolveProvider(),
      exec: realExec,
      platform: process.platform,
      arch: process.arch,
    });
  } catch (e) {
    fail(e);
  }
}

export async function runKitNew(): Promise<void> {
  const target = process.env.KIT_NEW_TARGET ?? join(process.cwd(), 'my-kit');
  const machine = process.env.KIT_NEW_MACHINE ?? 'my-mac';
  const user = process.env.USER ?? 'me';
  try {
    await scaffoldKit({ target, name: 'my-kit', machine, user, exec: realExec });
    render(React.createElement(Text, { color: colors.success }, `✓ Scaffolded ${target}`));
  } catch (e) {
    fail(e);
  }
}

export async function runKitUpdate(): Promise<void> {
  try {
    const config = await loadKitConfig();
    const machine = resolveMachine(config);
    const m = config.machines[machine];
    const start = Date.now();
    const isTty = process.stdout.isTTY;
    const cyan = (s: string) => (isTty ? `\x1b[36m${s}\x1b[0m` : s);
    const green = (s: string) => (isTty ? `\x1b[32m${s}\x1b[0m` : s);
    const dim = (s: string) => (isTty ? `\x1b[2m${s}\x1b[0m` : s);
    const bold = (s: string) => (isTty ? `\x1b[1m${s}\x1b[0m` : s);

    process.stdout.write(`\n  ${bold('kit update')}  ${dim(`· ${machine}`)}\n`);
    process.stdout.write(`  ${dim('─'.repeat(40))}\n\n`);

    await runUpdate({
      machine,
      machineType: m.type,
      kitRepoDir: config.repoDir,
      provider: resolveProvider(),
      exec: realExec,
      sudoKeeper: realSudoKeeper,
      hooks: {
        onPhaseStart: (_phase, label) => {
          process.stdout.write(`  ${cyan('⠸')}  ${label}…`);
        },
        onPhaseEnd: (_phase, label, detail) => {
          process.stdout.write(`\r\x1b[2K  ${green('✓')}  ${label}`);
          if (detail) process.stdout.write(`  ${dim(detail)}`);
          process.stdout.write('\n');
        },
      },
    });

    const totalSecs = Math.round((Date.now() - start) / 1000);
    const fmt =
      totalSecs < 60 ? `${totalSecs}s` : `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s`;
    process.stdout.write(
      `\n  ${green('✓')}  ${bold(`${machine} is up to date`)}  ${dim(`(${fmt})`)}\n\n`
    );
  } catch (e) {
    fail(e);
  }
}

function fmtCheck(status: 'ok' | 'warn' | 'error' | 'info', tty: boolean): string {
  /* v8 ignore start */
  const c = (s: string, code: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
  /* v8 ignore stop */
  switch (status) {
    case 'ok':
      return c('✓', '32');
    case 'warn':
      return c('!', '33');
    case 'error':
      return c('✗', '31');
    case 'info':
      return c('·', '36');
  }
}

function printHumanReadable(report: Awaited<ReturnType<typeof renderStatus>>): void {
  const tty = process.stdout.isTTY;
  /* v8 ignore start */
  const dim = (s: string) => (tty ? `\x1b[2m${s}\x1b[0m` : s);
  const bold = (s: string) => (tty ? `\x1b[1m${s}\x1b[0m` : s);
  /* v8 ignore stop */

  process.stdout.write(`\n  ${bold('kit status')}  ${dim(`· ${report.machineId}`)}\n`);
  process.stdout.write(`  ${dim('─'.repeat(40))}\n\n`);

  for (const c of report.checks) {
    const glyph = fmtCheck(c.status, tty);
    let line = `  ${glyph}  ${c.label.padEnd(20)} ${c.detail ?? ''}`;
    if (c.hint && (c.status === 'warn' || c.status === 'error')) {
      line += `\n     ${dim(c.hint)}`;
    }
    process.stdout.write(`${line}\n`);
  }

  if (report.orgPolicy) {
    process.stdout.write(`\n  ${bold('Org Policy')} ${dim(`(${report.orgPolicy.apps.source})`)}\n`);
    for (const a of report.orgPolicy.apps.casks) {
      process.stdout.write(`    cask: ${a.name}  ${dim(`— ${a.reason}`)}\n`);
    }
    for (const a of report.orgPolicy.apps.brews) {
      process.stdout.write(`    brew: ${a.name}  ${dim(`— ${a.reason}`)}\n`);
    }
    for (const c of report.orgPolicy.baseline) {
      process.stdout.write(`    check: ${c.id}  ${dim(`— ${c.description}`)}\n`);
    }
  }

  process.stdout.write('\n');
}

export interface RunKitStatusOpts {
  json?: boolean;
}

export async function runKitStatus(opts: RunKitStatusOpts = {}): Promise<void> {
  try {
    const config = await loadKitConfig();
    const machine = resolveMachine(config);
    const report = await renderStatus({
      machine,
      kitRepoDir: config.repoDir,
      machineFile: machineFile(config.repoDir, machine),
      configPath: config.configPath,
      configRepoUrl: config.repo,
      knownMachines: Object.keys(config.machines),
      provider: resolveProvider(),
      exec: realExec,
    });
    const wantsJson = opts.json || !process.stdout.isTTY;
    if (wantsJson) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      printHumanReadable(report);
    }
  } catch (e) {
    if (opts.json && e instanceof KitError && e.code === errorCodes.KIT_CONFIG_NOT_FOUND) {
      const envelope = {
        ok: false as const,
        error: 'kit_config_not_found',
        message: 'No kit.config.json found.',
        searched: configCandidates(),
      };
      process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
      process.exit(1);
    }
    fail(e);
  }
}

export async function runKitConfigShow(): Promise<void> {
  try {
    const config = await loadKitConfig();
    const tty = process.stdout.isTTY;
    if (!tty) {
      process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
      return;
    }
    const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
    const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
    process.stdout.write(`\n  ${bold('kit config')}\n  ${dim('─'.repeat(40))}\n\n`);
    process.stdout.write(`  ${bold('source')}    ${config.configPath}\n`);
    process.stdout.write(`  ${bold('name')}      ${config.name}\n`);
    process.stdout.write(`  ${bold('repo')}      ${config.repo}\n`);
    process.stdout.write(`  ${bold('repoDir')}   ${config.repoDir}\n`);
    process.stdout.write(`  ${bold('machines')}\n`);
    for (const [name, m] of Object.entries(config.machines)) {
      process.stdout.write(`    ${name.padEnd(15)} ${dim(`type=${m.type}, user=${m.user}`)}\n`);
    }
    process.stdout.write('\n');
  } catch (e) {
    fail(e);
  }
}

export async function runKitConfigPath(): Promise<void> {
  try {
    const config = await loadKitConfig();
    process.stdout.write(`${config.configPath}\n`);
  } catch (e) {
    fail(e);
  }
}

export async function runKitApps(action: string, name?: string): Promise<void> {
  try {
    const config = await loadKitConfig();
    const machine = resolveMachine(config);
    const path = machineFile(config.repoDir, machine);
    if (action === 'list') {
      process.stdout.write(`${JSON.stringify(listApps(path), null, 2)}\n`);
      return;
    }
    if (!name) {
      console.error(
        'Usage: pilot kit apps <add|remove> <name>\n' +
          '  Default kind is cask. Use `brew:NAME` for brews, `cask:NAME` for explicit casks.'
      );
      process.exit(1);
    }
    const { kind, name: pkg } = parseAppsTarget(name);
    if (action === 'add') await addApp(path, pkg, kind);
    else if (action === 'remove') await removeApp(path, pkg, kind);
    else {
      console.error(`Unknown action: ${action}`);
      process.exit(1);
    }
  } catch (e) {
    fail(e);
  }
}

export async function runKitEdit(): Promise<void> {
  try {
    const config = await loadKitConfig();
    const machine = resolveMachine(config);
    const found = findMachineNix(join(config.repoDir, 'machines'), machine);
    const path = found ?? join(config.repoDir, 'machines', `${machine}.nix`);
    if (!found) {
      console.error(
        `No machine config found for "${machine}".\n` +
          `Looked under ${join(config.repoDir, 'machines')}.\n` +
          `Create ${path} or pick a configured machine.`
      );
      process.exit(1);
    }
    await runEdit(path, { env: process.env, exec: realExec });
  } catch (e) {
    fail(e);
  }
}

// Exported for tests.
export { resolveMachine };

export async function promptConfirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

export async function runKitClean(): Promise<void> {
  const isTty = process.stdout.isTTY;
  const cyan = (s: string) => (isTty ? `\x1b[36m${s}\x1b[0m` : s);
  const green = (s: string) => (isTty ? `\x1b[32m${s}\x1b[0m` : s);
  const red = (s: string) => (isTty ? `\x1b[31m${s}\x1b[0m` : s);
  const dim = (s: string) => (isTty ? `\x1b[2m${s}\x1b[0m` : s);
  const bold = (s: string) => (isTty ? `\x1b[1m${s}\x1b[0m` : s);

  process.stdout.write(`\n  ${bold('kit clean')}\n  ${dim('─'.repeat(40))}\n\n`);
  process.stdout.write(`  ${cyan('⠸')} Scanning your machine…\n`);

  const targets = await scanTargets(realExec).catch((e) => {
    fail(e);
  });

  if (targets.length === 0) {
    process.stdout.write(`  ${green('✓')} Nothing to clean.\n\n`);
    return;
  }

  process.stdout.write('\n');
  const labelWidth = Math.max(...targets.map((t) => t.target.label.length));

  for (const t of targets) {
    const size = t.target.kind === 'docker' ? dim('—') : formatBytes(t.bytes);
    process.stdout.write(`  ${t.target.label.padEnd(labelWidth + 2)} ${size}\n`);
  }

  const fileTotal = targets
    .filter((t) => t.target.kind !== 'docker')
    .reduce((sum, t) => sum + t.bytes, 0);
  const hasDocker = targets.some((t) => t.target.kind === 'docker');
  const totalLabel = formatBytes(fileTotal) + (hasDocker ? ' + Docker' : '');

  process.stdout.write(`\n  ${'─'.repeat(labelWidth + 14)}\n`);
  process.stdout.write(`  ${'Total'.padEnd(labelWidth + 2)} ${bold(totalLabel)}\n\n`);

  const yes = await promptConfirm(`  Ready to clean. Proceed? [y/N] `);
  if (!yes) {
    process.stdout.write(`\n  ${dim('Cancelled.')}\n\n`);
    return;
  }
  process.stdout.write('\n');

  const totalFreed = await deleteTargets(targets, realExec, (result) => {
    const t = targets.find((r) => r.target.id === result.id);
    if (!t) return;
    if (result.warning) {
      process.stdout.write(
        `  ${red('✗')} ${t.target.label.padEnd(labelWidth + 2)} ${dim(result.warning)}\n`
      );
    } else {
      const freed = result.freed > 0 ? formatBytes(result.freed) : '—';
      process.stdout.write(
        `  ${green('✓')} ${t.target.label.padEnd(labelWidth + 2)} ${dim(`${freed} freed`)}\n`
      );
    }
  });

  process.stdout.write(
    `\n  ${green('✓')} ${bold(`${formatBytes(totalFreed)} freed.`)} All clear.\n\n`
  );
}
