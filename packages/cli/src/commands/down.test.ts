// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';

vi.mock('../registry/fetch.js', () => ({
  fetchRegistry: vi.fn().mockResolvedValue({
    index: {
      version: 1,
      publishedAt: '',
      sha256: 'x',
      templates: [
        {
          name: 'remotion',
          displayName: 'Remotion Video Studio',
          description: 'Video',
          version: '1.0.0',
          category: 'video',
          platforms: ['darwin'],
          steps: [{ type: 'npm', pkg: '@remotion/cli', global: true, label: 'Remotion CLI' }],
        },
      ],
    },
    fromCache: false,
    offline: false,
  }),
}));

vi.mock('../installer/detect.js', () => ({
  detectPackageManagers: vi.fn().mockResolvedValue({
    nix: false,
    brew: false,
    winget: false,
    npm: true,
  }),
}));

vi.mock('../shell/exec.js', () => ({ realExec: {} }));

vi.mock('../device/state.js', () => ({
  getInstalledTemplateNames: vi.fn().mockReturnValue(['remotion']),
  removeTemplateFromState: vi.fn(),
  loadTemplateState: vi.fn().mockReturnValue({ templates: {} }),
  saveTemplateState: vi.fn(),
}));

vi.mock('../installer/runner.js', () => ({
  runUninstallSteps: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../settings.js', () => ({
  loadSettings: vi.fn().mockReturnValue({
    onboarded: true,
    plugins: {},
    mcpServers: {},
    crew: {
      specialists: {
        'video-specialist': { displayName: 'Video Specialist', skills: ['remotion'] },
      },
    },
  }),
  saveSettings: vi.fn(),
}));

vi.mock('../screens/up/UpInstall.js', () => ({
  UpInstall: vi.fn(),
}));

vi.mock('ink', () => ({
  render: vi
    .fn()
    .mockImplementation((_element) => ({ waitUntilExit: vi.fn().mockResolvedValue(undefined) })),
  Text: 'Text',
  Box: 'Box',
  useApp: () => ({ exit: vi.fn() }),
  useInput: vi.fn(),
}));

vi.mock('react', () => {
  const createElement = vi
    .fn()
    .mockImplementation((_type: unknown, props: Record<string, unknown> | null) => {
      if (props && typeof props.runSteps === 'function') {
        props.runSteps({
          onStepStart: vi.fn(),
          onStepSkip: vi.fn(),
          onStepDone: vi.fn(),
          onStepError: vi.fn(),
        });
      }
      return null;
    });
  return {
    default: { createElement },
    createElement,
    useState: vi.fn().mockReturnValue([[], vi.fn()]),
    useEffect: vi.fn(),
  };
});

describe('runDown', () => {
  it('throws DOWN_NOT_INSTALLED when template is not installed', async () => {
    const { runDown } = await import('./down.js');
    // 'unknown' is not in the default installed list (['remotion'])
    await expect(runDown('unknown')).rejects.toMatchObject({ code: 'DOWN_NOT_INSTALLED' });
  });

  it('cleans up state and crew specialist when template is installed but no longer in registry', async () => {
    const { fetchRegistry } = await import('../registry/fetch.js');
    const { getInstalledTemplateNames, removeTemplateFromState, loadTemplateState } = await import(
      '../device/state.js'
    );
    const { loadSettings: ls, saveSettings: ss } = await import('../settings.js');

    (getInstalledTemplateNames as ReturnType<typeof vi.fn>).mockReturnValueOnce(['orphan']);
    (fetchRegistry as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      index: { version: 1, publishedAt: '', sha256: 'x', templates: [] },
      fromCache: false,
      offline: false,
    });
    (loadTemplateState as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      templates: {
        orphan: {
          name: 'orphan',
          installedAt: '',
          lastChecked: '',
          dependencies: {},
          crewSpecialist: 'orphan-specialist',
        },
      },
    });
    (ls as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      onboarded: true,
      plugins: {},
      mcpServers: {},
      crew: {
        specialists: { 'orphan-specialist': { displayName: 'Orphan Specialist', skills: [] } },
      },
    });

    const { runDown } = await import('./down.js');
    await runDown('orphan');

    expect(removeTemplateFromState).toHaveBeenCalledWith('orphan');
    expect(ss).toHaveBeenCalledWith(expect.objectContaining({ crew: { specialists: {} } }));
  });

  it('runs persisted uninstall steps when registry entry is missing but state has steps', async () => {
    const { fetchRegistry } = await import('../registry/fetch.js');
    const { runUninstallSteps } = await import('../installer/runner.js');
    const { getInstalledTemplateNames, loadTemplateState, removeTemplateFromState } = await import(
      '../device/state.js'
    );
    const { saveSettings } = await import('../settings.js');

    (getInstalledTemplateNames as ReturnType<typeof vi.fn>).mockReturnValueOnce(['orphan']);
    (fetchRegistry as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      index: { version: 1, publishedAt: '', sha256: 'x', templates: [] },
      fromCache: false,
      offline: false,
    });
    (loadTemplateState as ReturnType<typeof vi.fn>).mockReturnValue({
      templates: {
        orphan: {
          name: 'orphan',
          installedAt: '2026-01-01',
          lastChecked: '2026-01-01',
          dependencies: {},
          crewSpecialist: 'orphan-specialist',
          steps: [{ type: 'npm', pkg: 'orphan-cli', global: true, label: 'Orphan CLI' }],
        },
      },
    });
    const { loadSettings: ls2 } = await import('../settings.js');
    (ls2 as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      onboarded: true,
      plugins: {},
      mcpServers: {},
      crew: {
        specialists: { 'orphan-specialist': { displayName: 'Orphan Specialist', skills: [] } },
      },
    });
    (saveSettings as ReturnType<typeof vi.fn>).mockClear();
    (runUninstallSteps as ReturnType<typeof vi.fn>).mockClear();
    (removeTemplateFromState as ReturnType<typeof vi.fn>).mockClear();

    const React = await import('react');
    (React.createElement as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_type: unknown, props: Record<string, unknown> | null) => {
        if (props && typeof props.runSteps === 'function') {
          (props.runSteps as (cbs: Record<string, unknown>) => void)({
            onStepStart: vi.fn(),
            onStepSkip: vi.fn(),
            onStepDone: vi.fn(),
            onStepError: vi.fn(),
          });
        }
        if (props?.onDone) void (props.onDone as () => Promise<void>)();
        return null;
      }
    );

    const { runDown } = await import('./down.js');
    await runDown('orphan');
    await Promise.resolve();
    await Promise.resolve();

    expect(runUninstallSteps).toHaveBeenCalled();
    expect(removeTemplateFromState).toHaveBeenCalledWith('orphan');
    expect(saveSettings).toHaveBeenCalled();
  });

  it('calls runUninstallSteps for an installed template', async () => {
    const { runUninstallSteps } = await import('../installer/runner.js');
    const { runDown } = await import('./down.js');
    await runDown('remotion');
    expect(runUninstallSteps).toHaveBeenCalled();
  });

  it('orphan cleanup skips crew settings when template has no crewSpecialist', async () => {
    const { fetchRegistry } = await import('../registry/fetch.js');
    const { getInstalledTemplateNames, removeTemplateFromState, loadTemplateState } = await import(
      '../device/state.js'
    );
    const { saveSettings } = await import('../settings.js');

    (getInstalledTemplateNames as ReturnType<typeof vi.fn>).mockReturnValueOnce(['orphan']);
    (fetchRegistry as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      index: { version: 1, publishedAt: '', sha256: 'x', templates: [] },
      fromCache: false,
      offline: false,
    });
    // Template is in state but has no crewSpecialist set.
    (loadTemplateState as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      templates: {
        orphan: {
          name: 'orphan',
          installedAt: '',
          lastChecked: '',
          dependencies: {},
        },
      },
    });

    (saveSettings as ReturnType<typeof vi.fn>).mockClear();

    const { runDown } = await import('./down.js');
    await runDown('orphan');

    expect(removeTemplateFromState).toHaveBeenCalledWith('orphan');
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('onDone path runs when template has no crew block (removeCrewSpecialist early-returns)', async () => {
    const { fetchRegistry } = await import('../registry/fetch.js');
    (fetchRegistry as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      index: {
        version: 1,
        publishedAt: '',
        sha256: 'x',
        templates: [
          {
            name: 'remotion',
            displayName: 'Remotion Video Studio',
            description: 'Video',
            version: '1.0.0',
            category: 'video',
            platforms: ['darwin'],
            steps: [{ type: 'npm', pkg: '@remotion/cli', global: true, label: 'Remotion CLI' }],
            // no crew — early return in removeCrewSpecialist
          },
        ],
      },
      fromCache: false,
      offline: false,
    });

    const { removeTemplateFromState } = await import('../device/state.js');
    const { saveSettings } = await import('../settings.js');
    (saveSettings as ReturnType<typeof vi.fn>).mockClear();

    const React = await import('react');
    (React.createElement as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_type: unknown, props: Record<string, unknown> | null) => {
        if (props?.onDone) void (props.onDone as () => Promise<void>)();
        return null;
      }
    );

    const { runDown } = await import('./down.js');
    await runDown('remotion');
    await Promise.resolve();
    await Promise.resolve();

    expect(removeTemplateFromState).toHaveBeenCalledWith('remotion');
    // removeCrewSpecialist returned early, so saveSettings is not invoked for crew.
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('calls removeTemplateFromState and removeCrewSpecialist in onDone', async () => {
    const { fetchRegistry } = await import('../registry/fetch.js');
    (fetchRegistry as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      index: {
        version: 1,
        publishedAt: '',
        sha256: 'x',
        templates: [
          {
            name: 'remotion',
            displayName: 'Remotion Video Studio',
            description: 'Video',
            version: '1.0.0',
            category: 'video',
            platforms: ['darwin'],
            steps: [{ type: 'npm', pkg: '@remotion/cli', global: true, label: 'Remotion CLI' }],
            crew: {
              specialist: 'video-specialist',
              displayName: 'Video Specialist',
              skills: ['remotion'],
            },
          },
        ],
      },
      fromCache: false,
      offline: false,
    });

    const { removeTemplateFromState } = await import('../device/state.js');
    const { saveSettings } = await import('../settings.js');
    const React = await import('react');
    (React.createElement as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_type: unknown, props: Record<string, unknown> | null) => {
        if (props && typeof props.runSteps === 'function') {
          (props.runSteps as (cbs: Record<string, unknown>) => void)({
            onStepStart: vi.fn(),
            onStepSkip: vi.fn(),
            onStepDone: vi.fn(),
            onStepError: vi.fn(),
          });
        }
        if (props?.onDone) void (props.onDone as () => Promise<void>)();
        return null;
      }
    );

    const { runDown } = await import('./down.js');
    await runDown('remotion');
    await Promise.resolve();
    await Promise.resolve();

    expect(removeTemplateFromState).toHaveBeenCalledWith('remotion');
    expect(saveSettings).toHaveBeenCalled();
  });
});
