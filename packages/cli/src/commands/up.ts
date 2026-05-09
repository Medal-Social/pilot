// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { homedir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink';
import React from 'react';
import {
  getInstalledTemplateNames,
  loadTemplateState,
  saveTemplateState,
} from '../device/state.js';
import { errorCodes, PilotError } from '../errors.js';
import { detectPackageManagers } from '../installer/detect.js';
import type { RunCallbacks } from '../installer/runner.js';
import { runInstallSteps } from '../installer/runner.js';
import { fetchRegistry } from '../registry/fetch.js';
import type { TemplateEntry } from '../registry/types.js';
import { loadSettings, saveSettings } from '../settings.js';
import { realExec } from '../shell/exec.js';

async function wireCrewSpecialist(entry: TemplateEntry): Promise<void> {
  if (!entry.crew) return;
  const settings = loadSettings();
  settings.crew.specialists[entry.crew.specialist] = {
    displayName: entry.crew.displayName,
    skills: entry.crew.skills,
  };
  saveSettings(settings);
}

async function markInstalled(entry: TemplateEntry): Promise<void> {
  const state = loadTemplateState();
  const deps: Record<string, boolean> = {};
  for (const step of entry.steps) {
    deps[step.label] = true;
  }
  state.templates[entry.name] = {
    name: entry.name,
    installedAt: new Date().toISOString(),
    lastChecked: new Date().toISOString(),
    dependencies: deps,
    crewSpecialist: entry.crew?.specialist,
    steps: entry.steps,
  };
  saveTemplateState(state);
}

export async function runUp(template?: string): Promise<void> {
  const cacheDir = join(homedir(), '.pilot', 'registry');
  const { index, offline } = await fetchRegistry({ cacheDir });

  if (!template) {
    let selected: string | null = null;
    const installedNames = getInstalledTemplateNames();
    const { UpBrowse } = await import('../screens/Up.js');
    const { unmount, waitUntilExit } = render(
      React.createElement(UpBrowse, {
        registry: index,
        installedNames,
        onInstall: (entry: TemplateEntry) => {
          if (selected !== null) return;
          selected = entry.name;
          unmount();
        },
      })
    );
    await waitUntilExit();
    if (selected !== null) {
      try {
        await runUp(selected);
      } catch (err) {
        // Surface install failures the same way the previous fire-and-forget
        // onInstall path did — without this the rejection escapes to the
        // top-level parseAsync() handler with no PilotError formatter.
        process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    }
    return;
  }

  const entry = index.templates.find((t) => t.name === template);
  if (!entry) throw new PilotError(errorCodes.UP_TEMPLATE_NOT_FOUND, template);

  if (entry.platforms.length > 0 && !entry.platforms.includes(process.platform)) {
    throw new PilotError(
      errorCodes.UP_STEP_FAILED,
      "This template isn't available for your system."
    );
  }

  if (offline) {
    process.stderr.write('⚠  Using cached registry (offline)\n');
  }

  const managers = await detectPackageManagers(realExec);

  const { UpInstall } = await import('../screens/up/UpInstall.js');
  const { waitUntilExit } = render(
    React.createElement(UpInstall, {
      entry,
      managers,
      runSteps: (callbacks: RunCallbacks) =>
        runInstallSteps(entry.steps, managers, undefined, callbacks),
      onDone: async () => {
        await markInstalled(entry);
        await wireCrewSpecialist(entry);
      },
    })
  );
  await waitUntilExit();
}
