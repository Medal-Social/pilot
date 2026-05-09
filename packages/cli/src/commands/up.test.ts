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
          platforms: [process.platform],
          steps: [],
          completionHint: 'Run remotion',
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

vi.mock('../installer/exec.js', () => ({ realExec: {} }));

vi.mock('../installer/runner.js', () => ({
  runInstallSteps: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../device/state.js', () => ({
  getInstalledTemplateNames: vi.fn().mockReturnValue([]),
  loadTemplateState: vi.fn().mockReturnValue({ templates: {} }),
  saveTemplateState: vi.fn(),
}));

vi.mock('../settings.js', () => ({
  loadSettings: vi
    .fn()
    .mockReturnValue({ onboarded: true, plugins: {}, mcpServers: {}, crew: { specialists: {} } }),
  saveSettings: vi.fn(),
}));

vi.mock('ink', () => ({
  render: vi.fn().mockReturnValue({
    unmount: vi.fn(),
    waitUntilExit: vi.fn().mockResolvedValue(undefined),
  }),
  Text: 'Text',
  Box: 'Box',
  useApp: () => ({ exit: vi.fn() }),
  useInput: vi.fn(),
}));

vi.mock('react', () => ({
  default: { createElement: vi.fn().mockReturnValue(null) },
  createElement: vi.fn().mockReturnValue(null),
  useState: vi.fn().mockReturnValue([[], vi.fn()]),
  useEffect: vi.fn(),
}));

vi.mock('../screens/Up.js', () => ({ UpBrowse: vi.fn() }));

describe('runUp', () => {
  it('throws UP_TEMPLATE_NOT_FOUND for unknown template', async () => {
    const { runUp } = await import('./up.js');
    await expect(runUp('unknown-template')).rejects.toMatchObject({
      code: 'UP_TEMPLATE_NOT_FOUND',
    });
  });

  it('renders UpInstall for a known template name', async () => {
    const { render } = await import('ink');
    const { runUp } = await import('./up.js');
    await runUp('remotion');
    expect(render).toHaveBeenCalled();
  });

  it('renders UpBrowse when called with no template', async () => {
    const { render } = await import('ink');
    const { runUp } = await import('./up.js');
    await runUp();
    expect(render).toHaveBeenCalled();
  });

  it('writes offline warning to stderr when registry is offline', async () => {
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
            platforms: [process.platform],
            steps: [],
            completionHint: 'Run remotion',
          },
        ],
      },
      fromCache: true,
      offline: true,
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { runUp } = await import('./up.js');
    await runUp('remotion');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('offline'));
    stderrSpy.mockRestore();
  });

  it('stores crewSpecialist key in template state and wires crew settings on install', async () => {
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
            platforms: [process.platform],
            steps: [],
            completionHint: 'Run remotion',
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

    const { saveTemplateState } = await import('../device/state.js');
    const { saveSettings } = await import('../settings.js');
    const React = await import('react');
    (React.default.createElement as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_type: unknown, props: Record<string, unknown> | null) => {
        if (props?.onDone) void (props.onDone as () => Promise<void>)();
        return null;
      }
    );

    const { runUp } = await import('./up.js');
    await runUp('remotion');
    await Promise.resolve();
    await Promise.resolve();

    expect(saveTemplateState).toHaveBeenCalledWith(
      expect.objectContaining({
        templates: expect.objectContaining({
          remotion: expect.objectContaining({ crewSpecialist: 'video-specialist' }),
        }),
      })
    );
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        crew: expect.objectContaining({
          specialists: expect.objectContaining({
            'video-specialist': expect.objectContaining({ displayName: 'Video Specialist' }),
          }),
        }),
      })
    );
  });

  it('throws UP_STEP_FAILED when template platforms exclude current platform', async () => {
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
            // Use a platform that is not the current one.
            platforms: [process.platform === 'darwin' ? 'win32' : 'darwin'],
            steps: [],
          },
        ],
      },
      fromCache: false,
      offline: false,
    });
    const { runUp } = await import('./up.js');
    await expect(runUp('remotion')).rejects.toMatchObject({ code: 'UP_STEP_FAILED' });
  });

  it('unmounts the browse UI before triggering the nested install render', async () => {
    const react = await import('react');
    const { render } = await import('ink');
    (render as ReturnType<typeof vi.fn>).mockClear();

    type OnInstall = (entry: { name: string }) => void;
    let capturedOnInstall: OnInstall | undefined;
    let callCounter = 0;
    let unmountCallOrder = -1;
    let secondRenderCallOrder = -1;

    // Browse render: unmount() resolves waitUntilExit, mirroring real ink behaviour.
    let resolveBrowseExit: (() => void) | undefined;
    const browseExitPromise = new Promise<void>((r) => {
      resolveBrowseExit = r;
    });
    const unmountSpy = vi.fn(() => {
      unmountCallOrder = ++callCounter;
      resolveBrowseExit?.();
    });
    (render as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      unmount: unmountSpy,
      waitUntilExit: vi.fn().mockReturnValue(browseExitPromise),
    }));
    // Install render: records its call order so we can assert ordering.
    (render as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      secondRenderCallOrder = ++callCounter;
      return {
        unmount: vi.fn(),
        waitUntilExit: vi.fn().mockResolvedValue(undefined),
      };
    });

    (react.default.createElement as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_type: unknown, props: Record<string, unknown> | null) => {
        if (props?.onInstall) capturedOnInstall = props.onInstall as OnInstall;
        return null;
      }
    );

    const { runUp } = await import('./up.js');
    const runPromise = runUp(); // browse mode
    // flush: fetchRegistry await + dynamic import('../screens/Up.js') await
    await new Promise((r) => setTimeout(r, 0));

    const fakeEntry = {
      name: 'remotion',
      displayName: 'Remotion',
      description: 'Video',
      version: '1.0.0',
      category: 'video',
      platforms: ['darwin'],
      steps: [],
    };

    capturedOnInstall?.(fakeEntry);
    capturedOnInstall?.(fakeEntry); // second call — should be ignored (selected already set)
    await runPromise;

    // unmount() must run before the second render() call.
    expect(unmountSpy).toHaveBeenCalledTimes(1);
    expect(unmountCallOrder).toBeGreaterThan(0);
    expect(secondRenderCallOrder).toBeGreaterThan(unmountCallOrder);
    // 1 for UpBrowse + 1 for UpInstall = 2 (not 3 — second onInstall ignored).
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('propagates the nested runUp rejection from onInstall after the browse UI exits', async () => {
    const { fetchRegistry } = await import('../registry/fetch.js');
    (fetchRegistry as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      index: { version: 1, publishedAt: '', sha256: 'x', templates: [] },
      fromCache: false,
      offline: false,
    });

    const { render } = await import('ink');
    let resolveBrowseExit: (() => void) | undefined;
    const browseExitPromise = new Promise<void>((r) => {
      resolveBrowseExit = r;
    });
    (render as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      unmount: vi.fn(() => resolveBrowseExit?.()),
      waitUntilExit: vi.fn().mockReturnValue(browseExitPromise),
    }));

    const react = await import('react');
    type OnInstall = (entry: { name: string }) => void;
    let capturedOnInstall: OnInstall | undefined;
    (react.default.createElement as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_type: unknown, props: Record<string, unknown> | null) => {
        if (props?.onInstall) capturedOnInstall = props.onInstall as OnInstall;
        return null;
      }
    );

    const { runUp } = await import('./up.js');
    const promise = runUp(); // browse mode
    await new Promise((r) => setTimeout(r, 0));

    // Template name not in the registry → nested runUp rejects with UP_TEMPLATE_NOT_FOUND.
    capturedOnInstall?.({ name: 'unknown-template' });

    await expect(promise).rejects.toMatchObject({ code: 'UP_TEMPLATE_NOT_FOUND' });
  });

  it('records each step label in the installed-template state', async () => {
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
            platforms: [process.platform],
            steps: [
              { type: 'npm', pkg: '@remotion/cli', global: true, label: 'Remotion CLI' },
              { type: 'skill', id: 'remotion', url: 'https://x/y.md', label: 'Remotion skill' },
            ],
          },
        ],
      },
      fromCache: false,
      offline: false,
    });

    const { saveTemplateState } = await import('../device/state.js');
    const React = await import('react');
    (React.default.createElement as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_type: unknown, props: Record<string, unknown> | null) => {
        if (props?.onDone) void (props.onDone as () => Promise<void>)();
        return null;
      }
    );

    const { runUp } = await import('./up.js');
    await runUp('remotion');
    await Promise.resolve();
    await Promise.resolve();

    expect(saveTemplateState).toHaveBeenCalledWith(
      expect.objectContaining({
        templates: expect.objectContaining({
          remotion: expect.objectContaining({
            dependencies: expect.objectContaining({
              'Remotion CLI': true,
              'Remotion skill': true,
            }),
          }),
        }),
      })
    );
  });

  it('invokes runInstallSteps when the UpInstall runSteps prop is called', async () => {
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
            platforms: [process.platform],
            steps: [],
          },
        ],
      },
      fromCache: false,
      offline: false,
    });

    const { runInstallSteps } = await import('../installer/runner.js');
    (runInstallSteps as ReturnType<typeof vi.fn>).mockClear();

    const React = await import('react');
    (React.default.createElement as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_type: unknown, props: Record<string, unknown> | null) => {
        if (props && typeof props.runSteps === 'function') {
          (props.runSteps as (cbs: Record<string, unknown>) => void)({
            onStepStart: vi.fn(),
            onStepSkip: vi.fn(),
            onStepDone: vi.fn(),
            onStepError: vi.fn(),
          });
        }
        return null;
      }
    );

    const { runUp } = await import('./up.js');
    await runUp('remotion');

    expect(runInstallSteps).toHaveBeenCalled();
  });
});
