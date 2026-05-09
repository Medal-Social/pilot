// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { errorCodes, PilotError } from '../errors.js';
import type {
  AnyStep,
  McpStep,
  NpmStep,
  PkgStep,
  SkillStep,
  ZedExtStep,
} from '../registry/types.js';
import type { Exec } from '../shell/exec.js';
import type { PackageManagers } from './detect.js';

const DEFAULT_SKILLS_DIR = join(homedir(), '.pilot', 'skills');

export interface StepContext {
  skillsDir?: string;
}

// --- pkg ---

type ResolvedPkg = { pm: 'nix' | 'brew' | 'winget'; pkg: string };

function resolvePkg(step: PkgStep, managers: PackageManagers): ResolvedPkg | null {
  // Known limitation: manager priority (nix > brew > winget) is computed fresh
  // on both install and uninstall. If the environment changes between install
  // and uninstall (e.g. Nix is installed later), the uninstall call may target
  // a different package manager than the one that performed the install. A
  // future change could persist the chosen manager in template state and
  // prefer it during uninstall; this requires expanding the state schema.
  if (managers.nix && step.nix) return { pm: 'nix', pkg: step.nix };
  if (managers.brew && step.brew) return { pm: 'brew', pkg: step.brew };
  if (managers.winget && step.winget) return { pm: 'winget', pkg: step.winget };
  return null;
}

async function checkPkg(step: PkgStep, managers: PackageManagers, exec: Exec): Promise<boolean> {
  const resolved = resolvePkg(step, managers);
  if (!resolved) return false;
  const { pm, pkg } = resolved;
  if (pm === 'nix') {
    const r = await exec.run('nix', ['profile', 'list']);
    return r.stdout.includes(pkg);
  }
  if (pm === 'brew') {
    const r = await exec.run('brew', ['list', pkg]);
    return r.code === 0;
  }
  const r = await exec.run('winget', ['list', '--id', pkg]);
  return r.code === 0;
}

async function executePkg(step: PkgStep, managers: PackageManagers, exec: Exec): Promise<void> {
  const resolved = resolvePkg(step, managers);
  if (!resolved) throw new PilotError(errorCodes.UP_NO_PACKAGE_MANAGER, step.label);
  const { pm, pkg } = resolved;
  let result: { code: number; stderr: string; stdout: string };
  if (pm === 'nix') {
    result = await exec.run('nix', ['profile', 'install', `nixpkgs#${pkg}`]);
  } else if (pm === 'brew') {
    result = await exec.run('brew', ['install', pkg]);
  } else {
    result = await exec.run('winget', [
      'install',
      '--id',
      pkg,
      '--silent',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ]);
  }
  if (result.code !== 0) throw new PilotError(errorCodes.UP_STEP_FAILED, result.stderr);
}

async function unexecutePkg(step: PkgStep, managers: PackageManagers, exec: Exec): Promise<void> {
  const resolved = resolvePkg(step, managers);
  if (!resolved) return;
  const { pm, pkg } = resolved;
  let result: { code: number; stderr: string; stdout: string };
  if (pm === 'nix') result = await exec.run('nix', ['profile', 'remove', `nixpkgs#${pkg}`]);
  else if (pm === 'brew') result = await exec.run('brew', ['uninstall', pkg]);
  else result = await exec.run('winget', ['uninstall', '--id', pkg, '--silent']);
  if (result.code !== 0) throw new PilotError(errorCodes.UP_STEP_FAILED, result.stderr);
}

// --- npm ---

async function checkNpm(step: NpmStep, exec: Exec): Promise<boolean> {
  const args = step.global
    ? ['list', '-g', '--depth=0', step.pkg]
    : ['list', '--depth=0', step.pkg];
  const r = await exec.run('npm', args);
  return r.code === 0;
}

async function executeNpm(step: NpmStep, exec: Exec): Promise<void> {
  const args = step.global ? ['install', '-g', step.pkg] : ['install', step.pkg];
  const result = await exec.run('npm', args);
  if (result.code !== 0) throw new PilotError(errorCodes.UP_STEP_FAILED, result.stderr);
}

async function unexecuteNpm(step: NpmStep, exec: Exec): Promise<void> {
  const args = step.global ? ['uninstall', '-g', step.pkg] : ['uninstall', step.pkg];
  const result = await exec.run('npm', args);
  if (result.code !== 0) throw new PilotError(errorCodes.UP_STEP_FAILED, result.stderr);
}

// --- skill ---

const SAFE_SKILL_ID = /^[a-zA-Z0-9_-]+$/;

function resolveSkillPath(dir: string, id: string): string {
  if (!SAFE_SKILL_ID.test(id)) {
    throw new PilotError(errorCodes.UP_STEP_FAILED, `Invalid skill id: ${id}`);
  }
  return join(dir, `${id}.md`);
}

async function checkSkill(step: SkillStep, ctx: StepContext): Promise<boolean> {
  const dir = ctx.skillsDir ?? DEFAULT_SKILLS_DIR;
  return existsSync(resolveSkillPath(dir, step.id));
}

async function executeSkill(step: SkillStep, ctx: StepContext): Promise<void> {
  const dir = ctx.skillsDir ?? DEFAULT_SKILLS_DIR;
  mkdirSync(dir, { recursive: true });
  const filePath = resolveSkillPath(dir, step.id);
  let res: Response;
  try {
    res = await fetch(step.url);
  } catch (err) {
    throw new PilotError(
      errorCodes.UP_STEP_FAILED,
      err instanceof Error ? err.message : String(err)
    );
  }
  if (!res.ok)
    throw new PilotError(errorCodes.UP_STEP_FAILED, `Failed to fetch skill: ${res.status}`);
  const content = await res.text();
  writeFileSync(filePath, content);
}

async function unexecuteSkill(step: SkillStep, ctx: StepContext): Promise<void> {
  const dir = ctx.skillsDir ?? DEFAULT_SKILLS_DIR;
  const file = resolveSkillPath(dir, step.id);
  if (existsSync(file)) rmSync(file);
}

// --- mcp ---

async function checkMcp(step: McpStep): Promise<boolean> {
  try {
    const { loadSettings } = await import('../settings.js');
    const settings = loadSettings();
    const existing = settings.mcpServers[step.server];
    return existing !== undefined && existing.command === step.command;
  } catch {
    return false;
  }
}

async function executeMcp(step: McpStep): Promise<void> {
  const { loadSettings, saveSettings } = await import('../settings.js');
  const settings = loadSettings();
  settings.mcpServers = {
    ...settings.mcpServers,
    [step.server]: { command: step.command },
  };
  saveSettings(settings);
}

async function unexecuteMcp(step: McpStep): Promise<void> {
  const { loadSettings, saveSettings } = await import('../settings.js');
  const settings = loadSettings();
  delete settings.mcpServers[step.server];
  saveSettings(settings);
}

// --- zed-extension ---

function getZedSettingsPath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Zed', 'settings.json');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, 'Zed', 'settings.json');
  }
  return join(homedir(), '.config', 'zed', 'settings.json');
}

// Zed has no CLI for listing installed extensions; check always returns false (write is idempotent)
async function checkZedExt(_step: ZedExtStep): Promise<boolean> {
  return false;
}

async function executeZedExt(step: ZedExtStep): Promise<void> {
  const zedSettingsPath = getZedSettingsPath();
  if (!existsSync(zedSettingsPath)) return;
  try {
    const raw = JSON.parse(readFileSync(zedSettingsPath, 'utf-8')) as Record<string, unknown>;
    const extensions: Record<string, boolean> =
      (raw.auto_install_extensions as Record<string, boolean>) ?? {};
    extensions[step.id] = true;
    raw.auto_install_extensions = extensions;
    writeFileSync(zedSettingsPath, JSON.stringify(raw, null, 2));
  } catch {
    // Non-fatal: Zed settings may be in an unexpected format
  }
}

async function unexecuteZedExt(step: ZedExtStep): Promise<void> {
  const zedSettingsPath = getZedSettingsPath();
  if (!existsSync(zedSettingsPath)) return;
  try {
    const raw = JSON.parse(readFileSync(zedSettingsPath, 'utf-8')) as Record<string, unknown>;
    const extensions: Record<string, boolean> =
      (raw.auto_install_extensions as Record<string, boolean>) ?? {};
    delete extensions[step.id];
    raw.auto_install_extensions = extensions;
    writeFileSync(zedSettingsPath, JSON.stringify(raw, null, 2));
  } catch {
    // Non-fatal
  }
}

// --- Public API ---

export async function checkStep(
  step: AnyStep,
  managers: PackageManagers,
  exec: Exec,
  ctx: StepContext = {}
): Promise<boolean> {
  switch (step.type) {
    case 'pkg':
      return checkPkg(step, managers, exec);
    case 'npm':
      return checkNpm(step, exec);
    case 'skill':
      return checkSkill(step, ctx);
    case 'mcp':
      return checkMcp(step);
    case 'zed-extension':
      return checkZedExt(step);
  }
}

export async function executeStep(
  step: AnyStep,
  managers: PackageManagers,
  exec: Exec,
  ctx: StepContext = {}
): Promise<void> {
  switch (step.type) {
    case 'pkg':
      return executePkg(step, managers, exec);
    case 'npm':
      return executeNpm(step, exec);
    case 'skill':
      return executeSkill(step, ctx);
    case 'mcp':
      return executeMcp(step);
    case 'zed-extension':
      return executeZedExt(step);
  }
}

export async function unexecuteStep(
  step: AnyStep,
  managers: PackageManagers,
  exec: Exec,
  ctx: StepContext = {}
): Promise<void> {
  switch (step.type) {
    case 'pkg':
      return unexecutePkg(step, managers, exec);
    case 'npm':
      return unexecuteNpm(step, exec);
    case 'skill':
      return unexecuteSkill(step, ctx);
    case 'mcp':
      return unexecuteMcp(step);
    case 'zed-extension':
      return unexecuteZedExt(step);
  }
}
