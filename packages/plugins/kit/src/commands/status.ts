// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from 'node:fs';
import { loadAppsJson } from '../apps/store.js';
import type { FleetProvider, RequiredApps, SecurityCheck } from '../provider/types.js';
import type { Exec } from '../shell/exec.js';

export type CheckStatus = 'ok' | 'warn' | 'error' | 'info';

export interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
  hint?: string;
}

export interface RenderStatusOpts {
  machine: string;
  kitRepoDir: string;
  machineFile: string;
  configPath?: string;
  configRepoUrl?: string;
  knownMachines?: ReadonlyArray<string>;
  provider: FleetProvider;
  exec: Exec;
  user?: string;
  /** "self" (default) → all git checks run. "none" → drop git rows; surface mismatch warnings. */
  gitStrategy?: 'self' | 'none';
}

export interface StatusReport {
  machineId: string;
  configPath: string | null;
  configRepoUrl: string | null;
  remoteUrl: string | null;
  remoteMatchesConfig: boolean | null;
  appsCount: number;
  repoClean: boolean;
  commitsBehind: number;
  kitCommit: string | null;
  hostnameKnown: boolean | null;
  tools: Record<string, string | null>;
  checks: HealthCheck[];
  orgPolicy?: { apps: RequiredApps; baseline: SecurityCheck[] };
}

async function probeTool(
  exec: Exec,
  cmd: string,
  args: string[] = ['--version']
): Promise<string | null> {
  const r = await exec.run(cmd, args);
  if (r.code !== 0) return null;
  // Take the first non-empty line and trim — usually contains the version.
  const line = r.stdout.split('\n').find((l) => l.trim().length > 0);
  return line?.trim() ?? '';
}

export async function renderStatus(opts: RenderStatusOpts): Promise<StatusReport> {
  const checks: HealthCheck[] = [];

  // Apps file
  const apps = existsSync(opts.machineFile)
    ? loadAppsJson(opts.machineFile)
    : { casks: [], brews: [] };
  const appsCount = apps.casks.length + apps.brews.length;
  if (existsSync(opts.machineFile)) {
    checks.push({
      id: 'apps-file',
      label: 'apps.json',
      status: 'ok',
      detail: `${appsCount} package(s)`,
    });
  } else {
    checks.push({
      id: 'apps-file',
      label: 'apps.json',
      status: 'warn',
      detail: 'not found',
      hint: `Create one at ${opts.machineFile} or run \`pilot kit update\` to migrate inline lists.`,
    });
  }

  // Config file location + repo URL
  if (opts.configPath) {
    checks.push({
      id: 'config',
      label: 'kit.config.json',
      status: 'ok',
      detail: opts.configPath,
    });
  }

  // Repo dir / git
  const repoDirExists = existsSync(opts.kitRepoDir);
  const repoIsGit = repoDirExists && existsSync(`${opts.kitRepoDir}/.git`);
  const strategy: 'self' | 'none' = opts.gitStrategy ?? 'self';

  if (!repoDirExists) {
    checks.push({
      id: 'repo-dir',
      label: 'repo directory',
      status: 'error',
      detail: opts.kitRepoDir,
      hint: 'The kitRepoDir from kit.config.json does not exist on this machine. Clone the repo or fix the path.',
    });
  } else if (strategy === 'none') {
    if (repoIsGit) {
      checks.push({
        id: 'repo-dir',
        label: 'repo directory',
        status: 'warn',
        detail: opts.kitRepoDir,
        hint: 'gitStrategy=none but a `.git` is present in this directory. If you meant pilot to manage updates, set `"gitStrategy": "self"` (or remove the field).',
      });
    } else {
      checks.push({
        id: 'repo-dir',
        label: 'repo directory',
        status: 'ok',
        detail: opts.kitRepoDir,
      });
    }
  } else if (!repoIsGit) {
    // gitStrategy=self but no .git here. Probe for an ancestor toplevel — a strong
    // hint that the user moved the kit into a host monorepo and forgot to declare
    // gitStrategy=none. Failure of `--show-toplevel` (no git binary, no ancestor)
    // falls through to the original "not a git repo" error.
    let parentToplevel: string | null = null;
    try {
      const r = await opts.exec.run('git', ['-C', opts.kitRepoDir, 'rev-parse', '--show-toplevel']);
      if (r.code === 0) {
        const top = r.stdout.trim();
        if (top && top !== opts.kitRepoDir) parentToplevel = top;
      }
    } catch {
      // ignore — fall through
    }
    if (parentToplevel) {
      checks.push({
        id: 'repo-dir',
        label: 'repo directory',
        status: 'warn',
        detail: opts.kitRepoDir,
        hint: `Kit dir is inside a parent git repo (${parentToplevel}). If this is intentional, set "gitStrategy": "none" in kit.config.json.`,
      });
    } else {
      checks.push({
        id: 'repo-dir',
        label: 'repo directory',
        status: 'error',
        detail: `${opts.kitRepoDir} (not a git repo)`,
        hint: 'Run `git init` in this directory or point kitRepoDir at the actual kit clone.',
      });
    }
  } else {
    checks.push({
      id: 'repo-dir',
      label: 'repo directory',
      status: 'ok',
      detail: opts.kitRepoDir,
    });
  }

  // Variables produced by the git-checks block below. Hoisted so the StatusReport
  // shape is stable when the block is skipped (gitStrategy=none, or no .git).
  let kitCommit: string | null = null;
  let repoClean = true;
  let remoteUrl: string | null = null;
  let remoteMatchesConfig: boolean | null = null;
  let commitsBehind = 0;

  if (strategy === 'self' && repoIsGit) {
    // Git HEAD
    const headRev = await opts.exec.run('git', ['-C', opts.kitRepoDir, 'rev-parse', 'HEAD']);
    kitCommit = headRev.code === 0 ? headRev.stdout.trim() : null;

    // Working tree clean
    const status = await opts.exec.run('git', ['-C', opts.kitRepoDir, 'status', '--porcelain']);
    repoClean = status.code === 0 && status.stdout.trim().length === 0;
    checks.push({
      id: 'repo-clean',
      label: 'working tree',
      status: repoClean ? 'ok' : 'warn',
      detail: repoClean
        ? 'clean'
        : `${status.stdout.trim().split('\n').length} uncommitted change(s)`,
      hint: repoClean ? undefined : 'Commit or stash before `pilot kit update` to avoid surprises.',
    });

    // Remote URL match
    const remote = await opts.exec.run('git', [
      '-C',
      opts.kitRepoDir,
      'remote',
      'get-url',
      'origin',
    ]);
    if (remote.code === 0) {
      remoteUrl = remote.stdout.trim();
      if (opts.configRepoUrl) {
        remoteMatchesConfig = remoteUrl === opts.configRepoUrl;
        checks.push({
          id: 'remote',
          label: 'git remote',
          status: remoteMatchesConfig ? 'ok' : 'warn',
          detail: remoteUrl,
          hint: remoteMatchesConfig
            ? undefined
            : `Configured repo is ${opts.configRepoUrl} but local origin is ${remoteUrl}.`,
        });
      } else {
        checks.push({ id: 'remote', label: 'git remote', status: 'ok', detail: remoteUrl });
      }
    } else {
      checks.push({
        id: 'remote',
        label: 'git remote',
        status: 'warn',
        detail: 'no origin configured',
      });
    }

    // Fetch + commits behind. Failure to determine sync state must surface as
    // a warning — not a silent "up to date" — so users see auth/upstream issues.
    const fetch = await opts.exec.run('git', ['-C', opts.kitRepoDir, 'fetch', '--quiet']);
    const behind = await opts.exec.run('git', [
      '-C',
      opts.kitRepoDir,
      'rev-list',
      'HEAD..@{u}',
      '--count',
    ]);

    if (fetch.code !== 0) {
      const detail = fetch.stderr.trim().split('\n').slice(0, 2).join(' · ') || 'fetch failed';
      checks.push({
        id: 'sync',
        label: 'sync',
        status: 'warn',
        detail: `could not fetch (${detail})`,
        hint: 'Check network and remote auth (`git -C <repoDir> fetch` to reproduce).',
      });
    } else if (behind.code !== 0) {
      // Most common cause: no upstream tracking branch (`@{u}` undefined).
      const stderr = behind.stderr.trim();
      const noUpstream = /no upstream|unknown revision|HEAD/i.test(stderr);
      checks.push({
        id: 'sync',
        label: 'sync',
        status: 'warn',
        detail: noUpstream
          ? 'no upstream tracking branch'
          : `could not determine sync (${stderr.split('\n')[0] || `exit ${behind.code}`})`,
        hint: noUpstream
          ? 'Set an upstream: `git -C <repoDir> branch --set-upstream-to=origin/<branch>`.'
          : 'Inspect `git -C <repoDir> rev-list HEAD..@{u} --count` to debug.',
      });
    } else {
      const parsed = Number.parseInt(behind.stdout.trim(), 10);
      if (Number.isNaN(parsed)) {
        checks.push({
          id: 'sync',
          label: 'sync',
          status: 'warn',
          detail: `unparseable rev-list output: ${behind.stdout.trim().slice(0, 60)}`,
        });
      } else {
        commitsBehind = parsed;
        checks.push({
          id: 'sync',
          label: 'sync',
          status: commitsBehind === 0 ? 'ok' : 'warn',
          detail: commitsBehind === 0 ? 'up to date' : `${commitsBehind} commit(s) behind`,
          hint: commitsBehind === 0 ? undefined : 'Run `pilot kit update` to pull and apply.',
        });
      }
    }
  }

  // Hostname check
  let hostnameKnown: boolean | null = null;
  if (opts.knownMachines) {
    hostnameKnown = opts.knownMachines.includes(opts.machine);
    checks.push({
      id: 'machine',
      label: 'machine',
      status: hostnameKnown ? 'ok' : 'warn',
      detail: hostnameKnown ? opts.machine : `${opts.machine} (not in kit.config.json)`,
      hint: hostnameKnown
        ? undefined
        : `Add "${opts.machine}" to kit.config.json → machines, or pass an explicit machine name.`,
    });
  }

  // Tool probes
  const [git, nix, gh, sudo] = await Promise.all([
    probeTool(opts.exec, 'git'),
    probeTool(opts.exec, 'nix'),
    probeTool(opts.exec, 'gh'),
    probeTool(opts.exec, 'sudo', ['-V']),
  ]);
  const tools = { git, nix, gh, sudo };
  for (const [name, version] of Object.entries(tools)) {
    // git tool is only required when gitStrategy=self. Skip the check
    // entirely in 'none' mode so users who deliberately don't have git
    // installed don't see a spurious error for tooling they don't need.
    if (name === 'git' && strategy === 'none') continue;
    checks.push({
      id: `tool-${name}`,
      label: name,
      status: version === null ? 'error' : 'ok',
      detail: version ?? 'not installed',
      hint:
        version === null
          ? `Install \`${name}\` — kit needs it for ${
              name === 'nix'
                ? 'building system config'
                : name === 'gh'
                  ? 'GitHub auth and key upload'
                  : name === 'sudo'
                    ? 'system rebuild'
                    : 'repo operations'
            }.`
          : undefined,
    });
  }

  // Provider org policy
  const ctx = {
    machineId: opts.machine,
    user: opts.user ?? process.env.USER ?? '',
    kitRepoDir: opts.kitRepoDir,
  };
  const required = await opts.provider.getRequiredApps(ctx);
  const baseline = await opts.provider.getSecurityBaseline(ctx);
  const hasOrgPolicy = required.casks.length + required.brews.length + baseline.length > 0;

  return {
    machineId: opts.machine,
    configPath: opts.configPath ?? null,
    configRepoUrl: opts.configRepoUrl ?? null,
    remoteUrl,
    remoteMatchesConfig,
    appsCount,
    repoClean,
    commitsBehind,
    kitCommit,
    hostnameKnown,
    tools,
    checks,
    orgPolicy: hasOrgPolicy ? { apps: required, baseline } : undefined,
  };
}
