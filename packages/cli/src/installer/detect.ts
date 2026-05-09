// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { Exec } from '../shell/exec.js';

export interface PackageManagers {
  nix: boolean;
  brew: boolean;
  winget: boolean;
  npm: boolean;
}

async function probe(exec: Exec, cmd: string, args: string[]): Promise<boolean> {
  const { code } = await exec.run(cmd, args);
  return code === 0;
}

export async function detectPackageManagers(exec: Exec): Promise<PackageManagers> {
  const [nix, brew, winget, npm] = await Promise.all([
    probe(exec, 'nix', ['--version']),
    probe(exec, 'brew', ['--version']),
    probe(exec, 'winget', ['--version']),
    probe(exec, 'npm', ['--version']),
  ]);
  return { nix, brew, winget, npm };
}
