#!/usr/bin/env node
// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { program } from 'commander';
import { loadSettings } from '../settings.js';
import { VERSION } from '../version.js';

program.name('pilot').description('Your AI crew, ready to fly.').version(VERSION, '-v, --version');

program
  .command('up [template]')
  .description('One-click setup — install templates, skills, crew bindings')
  .action(async (template?: string) => {
    const { runUp } = await import('../commands/up.js');
    await runUp(template);
  });

program
  .command('crew')
  .description('Manage your AI crew')
  .action(async () => {
    const { runCrew } = await import('../commands/crew.js');
    await runCrew();
  });

program
  .command('training')
  .description('Knowledge base — teach your crew about your brand')
  .action(async () => {
    const { runTraining } = await import('../commands/training.js');
    await runTraining();
  });

program
  .command('plugins')
  .description('Browse and manage plugins')
  .action(async () => {
    const { runPlugins } = await import('../commands/plugins.js');
    await runPlugins();
  });

program
  .command('update')
  .description('Check for and apply updates')
  .action(async () => {
    const { runUpdate } = await import('../commands/update.js');
    await runUpdate();
  });

program
  .command('status')
  .description('Machine and system health')
  .option('--json', 'Output status as JSON')
  .action(async (opts: { json?: boolean }) => {
    const { runStatus } = await import('../commands/status.js');
    await runStatus({ json: opts.json });
  });

program
  .command('usage')
  .description('AI token usage and costs for this project')
  .option('--week', 'Last 7 days')
  .option('--month', 'Current calendar month')
  .option('--since <YYYYMMDD>', 'From date to now')
  .option('--json', 'Output as JSON')
  .action(async (opts: { week?: boolean; month?: boolean; since?: string; json?: boolean }) => {
    const { runUsage } = await import('../commands/usage.js');
    await runUsage(opts);
  });

program
  .command('help')
  .description('Help reference')
  .action(async () => {
    const { runHelp } = await import('../commands/help.js');
    await runHelp();
  });

program
  .command('uninstall')
  .description('Remove Pilot and all its files from your machine')
  .action(async () => {
    const { runUninstall } = await import('../commands/uninstall.js');
    await runUninstall();
  });

program
  .command('down <template>')
  .description("Remove a template's installed tools (inverse of pilot up)")
  .action(async (template: string) => {
    const { runDown } = await import('../commands/down.js');
    await runDown(template);
  });

program
  .command('completions <shell>')
  .description('Output shell completion script (bash, zsh, fish)')
  .action(async (shell: string) => {
    const { runCompletions } = await import('../commands/completions.js');
    await runCompletions(shell);
  });

program
  .command('admin')
  .description('Admin dashboard and command center')
  .action(async () => {
    const { runAdmin } = await import('../commands/admin.js');
    await runAdmin();
  });

const settings = loadSettings();
const kitEnabled = settings.plugins['@medalsocial/kit']?.enabled !== false;

if (kitEnabled) {
  const kit = program.command('kit').description('Machine configuration & Nix management');

  kit
    .command('init [machine]')
    .description('Bootstrap an existing kit repo on this machine')
    .action(async (machine?: string) => {
      const { runKitInit } = await import('../commands/kit.js');
      await runKitInit(machine);
    });

  kit
    .command('new')
    .description('Scaffold a new kit repo from scratch')
    .action(async () => {
      const { runKitNew } = await import('../commands/kit.js');
      await runKitNew();
    });

  kit
    .command('update')
    .description('Pull latest config and rebuild the system')
    .action(async () => {
      const { runKitUpdate } = await import('../commands/kit.js');
      await runKitUpdate();
    });

  kit
    .command('status')
    .description('Machine health, apps, secrets, repo state')
    .option('--json', 'Output status as JSON')
    .action(async (opts: { json?: boolean }) => {
      const { runKitStatus } = await import('../commands/kit.js');
      await runKitStatus({ json: opts.json });
    });

  kit
    .command('apps <action> [name]')
    .description('Manage Homebrew casks/brews (add | remove | list)')
    .action(async (action: string, name?: string) => {
      const { runKitApps } = await import('../commands/kit.js');
      await runKitApps(action, name);
    });

  kit
    .command('edit')
    .description("Open this machine's config in $EDITOR")
    .action(async () => {
      const { runKitEdit } = await import('../commands/kit.js');
      await runKitEdit();
    });

  kit
    .command('clean')
    .description('Remove junk and free disk space')
    .action(async () => {
      const { runKitClean } = await import('../commands/kit.js');
      await runKitClean();
    });

  const kitConfig = kit.command('config').description('Inspect the loaded kit.config.json');

  kitConfig
    .command('show')
    .description('Show the loaded config and where it was loaded from')
    .action(async () => {
      const { runKitConfigShow } = await import('../commands/kit.js');
      await runKitConfigShow();
    });

  kitConfig
    .command('path')
    .description('Print the absolute path to the loaded kit.config.json')
    .action(async () => {
      const { runKitConfigPath } = await import('../commands/kit.js');
      await runKitConfigPath();
    });
}

const dispatchEnabled = settings.plugins['@medalsocial/dispatch']?.enabled === true;

if (dispatchEnabled) {
  const dispatch = program.command('dispatch').description('Medal Dispatch — fleet manager');

  dispatch
    .command('status')
    .description('Plugin health check')
    .action(async () => {
      const { runDispatchStatus } = await import('../commands/dispatch.js');
      await runDispatchStatus();
    });

  dispatch
    .command('up')
    .description('Start the dispatch hub under Pilot')
    .action(async () => {
      const { runDispatchUp } = await import('../commands/dispatch.js');
      await runDispatchUp();
    });

  dispatch
    .command('down')
    .description('Stop the dispatch hub')
    .action(async () => {
      const { runDispatchDown } = await import('../commands/dispatch.js');
      await runDispatchDown();
    });

  dispatch
    .command('worker <action>')
    .description('Worker subcommands (register, start)')
    .allowUnknownOption()
    .allowExcessArguments()
    .action(async (action: string, _opts: unknown, cmd: { args: string[] }) => {
      const { runDispatchPassthrough } = await import('../commands/dispatch.js');
      await runDispatchPassthrough(['worker', action, ...cmd.args.slice(1)]);
    });

  dispatch
    .command('source <action>')
    .description('Source subcommands (add, list)')
    .allowUnknownOption()
    .allowExcessArguments()
    .action(async (action: string, _opts: unknown, cmd: { args: string[] }) => {
      const { runDispatchPassthrough } = await import('../commands/dispatch.js');
      await runDispatchPassthrough(['source', action, ...cmd.args.slice(1)]);
    });
}

program.action(async () => {
  const { runRepl } = await import('../commands/repl.js');
  await runRepl();
});

program.parseAsync();
