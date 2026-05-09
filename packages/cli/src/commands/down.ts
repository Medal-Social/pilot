// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { homedir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import React from 'react';
import {
  getInstalledTemplateNames,
  loadTemplateState,
  removeTemplateFromState,
} from '../device/state.js';
import { errorCodes, PilotError } from '../errors.js';
import { detectPackageManagers } from '../installer/detect.js';
import type { RunCallbacks } from '../installer/runner.js';
import { runUninstallSteps } from '../installer/runner.js';
import { fetchRegistry } from '../registry/fetch.js';
import type { TemplateEntry } from '../registry/types.js';
import { loadSettings, saveSettings } from '../settings.js';
import { realExec } from '../shell/exec.js';

async function removeCrewSpecialist(entry: TemplateEntry, templateName: string): Promise<void> {
  // Prefer the specialist recorded at install time — the registry entry may have
  // dropped its `crew` block since install, but the persisted state is what
  // actually wired the specialist into settings.
  const installed = loadTemplateState().templates[templateName]?.crewSpecialist;
  const specialist = installed ?? entry.crew?.specialist;
  if (!specialist) return;
  const settings = loadSettings();
  if (settings.crew.specialists[specialist]) {
    delete settings.crew.specialists[specialist];
    saveSettings(settings);
  }
}

export async function runDown(template: string): Promise<void> {
  const installedNames = getInstalledTemplateNames();
  if (!installedNames.includes(template))
    throw new PilotError(errorCodes.DOWN_NOT_INSTALLED, template);

  const cacheDir = join(homedir(), '.pilot', 'registry');
  const { index } = await fetchRegistry({ cacheDir });

  const entry = index.templates.find((t) => t.name === template);
  if (!entry) {
    // Registry no longer lists this template (removed remotely, or offline
    // fallback served a smaller bundle). Fall back to install-time persisted
    // steps so the machine is actually cleaned up instead of just forgetting
    // the template in state.
    const stored = loadTemplateState().templates[template];
    const storedSteps = stored?.steps;
    if (storedSteps && storedSteps.length > 0) {
      const otherInstalled = installedNames.filter((n) => n !== template);
      const managers = await detectPackageManagers(realExec);
      const { UpInstall } = await import('../screens/up/UpInstall.js');
      const { waitUntilExit } = render(
        React.createElement(UpInstall, {
          entry: {
            name: template,
            displayName: `Removing ${template}...`,
            description: '',
            version: stored?.installedAt ?? 'unknown',
            category: 'dev',
            platforms: ['darwin', 'linux', 'win32'],
            steps: storedSteps,
            completionHint: `Run \`pilot up ${template}\` to reinstall`,
          },
          managers,
          runSteps: (callbacks: RunCallbacks) =>
            runUninstallSteps(
              storedSteps,
              managers,
              undefined,
              otherInstalled,
              template,
              callbacks
            ),
          onDone: async () => {
            if (stored?.crewSpecialist) {
              const settings = loadSettings();
              if (settings.crew.specialists[stored.crewSpecialist]) {
                delete settings.crew.specialists[stored.crewSpecialist];
                saveSettings(settings);
              }
            }
            removeTemplateFromState(template);
          },
        })
      );
      await waitUntilExit();
      return;
    }
    // No persisted steps — best effort: clear crew + state only.
    if (stored?.crewSpecialist) {
      const settings = loadSettings();
      delete settings.crew.specialists[stored.crewSpecialist];
      saveSettings(settings);
    }
    removeTemplateFromState(template);
    return;
  }

  const otherInstalled = installedNames.filter((n) => n !== template);
  const managers = await detectPackageManagers(realExec);

  const { UpInstall } = await import('../screens/up/UpInstall.js');
  const { waitUntilExit } = render(
    React.createElement(UpInstall, {
      entry: {
        ...entry,
        displayName: `Removing ${entry.displayName}...`,
        completionHint: `Run \`pilot up ${template}\` to reinstall`,
      },
      managers,
      runSteps: (callbacks: RunCallbacks) =>
        runUninstallSteps(entry.steps, managers, undefined, otherInstalled, template, callbacks),
      onDone: async () => {
        // Remove crew settings BEFORE deleting template state so the installed
        // crewSpecialist lookup still works.
        await removeCrewSpecialist(entry, template);
        removeTemplateFromState(template);
      },
    })
  );
  await waitUntilExit();
}
