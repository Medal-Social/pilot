// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { errorCodes, PilotError } from '../errors.js';

export interface UpdateCheckResult {
  current: string;
  latest: string;
  hasUpdate: boolean;
  error?: PilotError;
}

export type InstallMethod = 'homebrew' | 'npm' | 'nix' | 'unknown';

function execAsync(cmd: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'utf-8', timeout }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  try {
    const output = await execAsync('npm', ['view', '@medalsocial/pilot', 'version'], 10000);
    const latest = output.trim();

    return {
      current: currentVersion,
      latest,
      hasUpdate: latest !== currentVersion,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // npm 404 means package isn't published yet — not an error
    if (message.includes('404') || message.includes('Not Found')) {
      return {
        current: currentVersion,
        latest: currentVersion,
        hasUpdate: false,
      };
    }
    return {
      current: currentVersion,
      latest: currentVersion,
      hasUpdate: false,
      error: new PilotError(errorCodes.UPDATE_CHECK_FAILED, message),
    };
  }
}

/**
 * Detect how the running pilot binary was installed by inspecting its filesystem path.
 *
 * Returns:
 * - `homebrew` if the resolved path lives under a Homebrew Cellar (e.g. `/opt/homebrew/Cellar/pilot/...`)
 * - `nix` if the resolved path lives under `/nix/store/` or `~/.nix-profile/`
 * - `npm` if the resolved path lives under npm's global root (`npm root -g`)
 * - `unknown` otherwise
 *
 * `execPath` defaults to `process.execPath` (overridable for tests). Symlinks are
 * resolved via `realpath` because Homebrew's `bin/pilot` is a symlink into Cellar.
 */
export async function detectInstallMethod(
  execPath: string = process.execPath
): Promise<InstallMethod> {
  let resolved = execPath;
  try {
    resolved = await realpath(execPath);
  } catch {
    // ignore — keep the original path
  }

  if (resolved.startsWith('/nix/store/') || resolved.includes('/.nix-profile/')) {
    return 'nix';
  }
  if (resolved.includes('/Cellar/pilot/')) {
    return 'homebrew';
  }

  try {
    const npmRoot = (await execAsync('npm', ['root', '-g'], 5000)).trim();
    if (npmRoot && resolved.startsWith(npmRoot)) return 'npm';
  } catch {
    // npm not installed or failed — fall through
  }

  return 'unknown';
}

export async function applyUpdate(
  execPath: string = process.execPath
): Promise<{ success: boolean; method: InstallMethod; error?: PilotError }> {
  const method = await detectInstallMethod(execPath);

  if (method === 'nix') {
    return {
      success: false,
      method,
      error: new PilotError(errorCodes.UPDATE_NIX_NOT_SUPPORTED),
    };
  }

  try {
    if (method === 'homebrew') {
      await execAsync('brew', ['upgrade', 'pilot'], 180000);
    } else {
      // npm + unknown both fall through to the npm-global path.
      await execAsync('npm', ['install', '-g', '@medalsocial/pilot@latest'], 120000);
    }
    return { success: true, method };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      method,
      error: new PilotError(errorCodes.UPDATE_INSTALL_FAILED, detail),
    };
  }
}
