// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadTemplateState } from '../device/state.js';
import { fetchRegistry } from '../registry/fetch.js';
import type { AnyStep, NpmStep, PkgStep, TemplateEntry } from '../registry/types.js';
import { realExec } from '../shell/exec.js';
import type { PackageManagers } from './detect.js';
import { checkStep, executeStep, unexecuteStep } from './steps.js';

export interface RunCallbacks {
  onStepStart(index: number): void;
  onStepSkip(index: number): void;
  onStepDone(index: number): void;
  onStepError(index: number, error: Error): void;
}

interface StepHandlers {
  checkStep: typeof checkStep;
  executeStep: typeof executeStep;
  unexecuteStep?: typeof unexecuteStep;
}

const defaultHandlers: StepHandlers = { checkStep, executeStep, unexecuteStep };

export async function runInstallSteps(
  steps: AnyStep[],
  managers: PackageManagers,
  handlers: StepHandlers = defaultHandlers,
  callbacks: RunCallbacks
): Promise<void> {
  const skillsDir = join(homedir(), '.pilot', 'skills');
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    callbacks.onStepStart(i);
    try {
      const satisfied = await handlers.checkStep(step, managers, realExec, { skillsDir });
      if (satisfied) {
        callbacks.onStepSkip(i);
        continue;
      }
      await handlers.executeStep(step, managers, realExec, { skillsDir });
      callbacks.onStepDone(i);
    } catch (err) {
      callbacks.onStepError(i, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }
}

export async function runUninstallSteps(
  steps: AnyStep[],
  managers: PackageManagers,
  handlers: StepHandlers = defaultHandlers,
  otherInstalledTemplates: string[],
  _templateName: string,
  callbacks: RunCallbacks
): Promise<void> {
  const skillsDir = join(homedir(), '.pilot', 'skills');
  const cacheDir = join(homedir(), '.pilot', 'registry');

  // Build a set of pkg / global-npm identifiers used by other templates
  // (shared-dependency protection).
  const sharedPkgs = new Set<string>();
  const sharedNpm = new Set<string>();
  // If any peer template cannot be resolved we conservatively protect ALL shared
  // step types (pkg + global npm).
  let unknownPeerExists = false;

  function absorbPeerSteps(peerSteps: AnyStep[]): void {
    for (const s of peerSteps) {
      if (s.type === 'pkg') {
        const p = s as PkgStep;
        if (p.nix) sharedPkgs.add(`nix:${p.nix}`);
        if (p.brew) sharedPkgs.add(`brew:${p.brew}`);
        if (p.winget) sharedPkgs.add(`winget:${p.winget}`);
      } else if (s.type === 'npm') {
        const n = s as NpmStep;
        if (n.global) sharedNpm.add(n.pkg);
      }
    }
  }

  if (otherInstalledTemplates.length > 0) {
    // Load locally-persisted template steps as a fallback for peers that are
    // missing from the registry (offline + bundled fallback, or registry
    // changes that removed a template).
    let localState: { templates: Record<string, { steps?: AnyStep[] }> } | undefined;
    try {
      localState = loadTemplateState() as {
        templates: Record<string, { steps?: AnyStep[] }>;
      };
    } catch {
      localState = undefined;
    }

    let registryTemplates: TemplateEntry[] = [];
    try {
      const { index } = await fetchRegistry({ cacheDir });
      registryTemplates = index.templates;
    } catch {
      // If registry fetch fails entirely, registryTemplates stays empty and we
      // rely on local state only.
    }

    for (const name of otherInstalledTemplates) {
      // Prefer install-time persisted steps — that is the set the peer actually
      // relies on. Registry metadata may have drifted since install (steps added,
      // removed, or renamed) and using it as the source of truth would miss
      // shared dependencies the peer still needs. Registry is used only when
      // local state has no stored steps (older installs pre-step-persistence).
      const stored = localState?.templates[name]?.steps;
      if (stored && Array.isArray(stored)) {
        absorbPeerSteps(stored);
        continue;
      }
      const entry = registryTemplates.find((t) => t.name === name);
      if (entry) {
        absorbPeerSteps(entry.steps);
        continue;
      }
      // No way to resolve this peer — conservatively protect everything.
      unknownPeerExists = true;
    }
  }

  const reversed = [...steps].reverse();
  let firstError: Error | undefined;
  for (let i = 0; i < reversed.length; i++) {
    const step = reversed[i];
    const originalIndex = steps.length - 1 - i;
    callbacks.onStepStart(originalIndex);

    // Shared-package protection (pkg)
    if (step.type === 'pkg') {
      const p = step as PkgStep;
      const isShared =
        unknownPeerExists ||
        (managers.nix && p.nix && sharedPkgs.has(`nix:${p.nix}`)) ||
        (managers.brew && p.brew && sharedPkgs.has(`brew:${p.brew}`)) ||
        (managers.winget && p.winget && sharedPkgs.has(`winget:${p.winget}`));
      if (isShared) {
        callbacks.onStepSkip(originalIndex);
        continue;
      }
    }

    // Shared-dependency protection (global npm)
    if (step.type === 'npm') {
      const n = step as NpmStep;
      if (n.global && (unknownPeerExists || sharedNpm.has(n.pkg))) {
        callbacks.onStepSkip(originalIndex);
        continue;
      }
    }

    try {
      const unexecute = handlers.unexecuteStep ?? unexecuteStep;
      await unexecute(step, managers, realExec, { skillsDir });
      callbacks.onStepDone(originalIndex);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      callbacks.onStepError(originalIndex, error);
      if (!firstError) firstError = error;
    }
  }
  if (firstError) throw firstError;
}
