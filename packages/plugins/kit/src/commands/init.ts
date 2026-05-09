// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { errorCodes, KitError } from '../errors.js';
import type { FleetProvider } from '../provider/types.js';
import type { Exec } from '../shell/exec.js';
import { githubStep } from '../steps/github.js';
import { nixStep } from '../steps/nix.js';
import { rebuildStep } from '../steps/rebuild.js';
import { repoStep } from '../steps/repo.js';
import { rosettaStep } from '../steps/rosetta.js';
import { secretsStep } from '../steps/secrets.js';
import { sshStep } from '../steps/ssh.js';
import { runSteps, type Step } from '../steps/types.js';
import { xcodeStep } from '../steps/xcode.js';

export interface InitStepsOpts {
  platform: NodeJS.Platform;
  arch: string;
}

export function initSteps(opts: InitStepsOpts): Step[] {
  const steps: Step[] = [];
  if (opts.platform === 'darwin') steps.push(xcodeStep);
  if (opts.platform === 'darwin' && opts.arch === 'arm64') steps.push(rosettaStep);
  steps.push(nixStep, sshStep, githubStep, repoStep, secretsStep, rebuildStep);
  return steps;
}

export interface RunInitOpts {
  machine: string;
  machineType: 'darwin' | 'nixos';
  kitRepoDir: string;
  kitRepoUrl: string;
  provider: FleetProvider;
  exec: Exec;
  platform: NodeJS.Platform;
  arch: string;
  user?: string;
  /** When 'none', runInit refuses with KIT_INIT_NOT_SUPPORTED_FOR_STRATEGY. Default 'self'. */
  gitStrategy?: 'self' | 'none';
}

export async function runInit(opts: RunInitOpts): Promise<void> {
  if (opts.gitStrategy === 'none') {
    throw new KitError(errorCodes.KIT_INIT_NOT_SUPPORTED_FOR_STRATEGY);
  }
  const ctx = {
    exec: opts.exec,
    env: {
      ...process.env,
      KIT_MACHINE: opts.machine,
      KIT_MACHINE_TYPE: opts.machineType,
      KIT_REPO_DIR: opts.kitRepoDir,
      KIT_REPO_URL: opts.kitRepoUrl,
    },
  };
  await runSteps(initSteps({ platform: opts.platform, arch: opts.arch }), {}, ctx);

  await opts.provider.reportStatus(
    {
      machineId: opts.machine,
      user: opts.user ?? process.env.USER ?? '',
      kitRepoDir: opts.kitRepoDir,
    },
    {
      machineId: opts.machine,
      os: opts.platform,
      arch: opts.arch,
      kitCommit: null,
      appsCount: 0,
    }
  );
}
