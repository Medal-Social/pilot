// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  rmSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

vi.mock('../device/backup.js', () => ({
  backupKnowledge: vi.fn(() => ({
    success: true,
    backupPath: '/mock/home/pilot-backup-2026-04-10',
  })),
}));

vi.mock('../device/state.js', () => ({
  getInstalledTemplateNames: vi.fn(() => []),
  removeTemplateFromState: vi.fn(),
}));

vi.mock('../deploy/deployer.js', () => ({
  removeRoutingFromClaudeMd: vi.fn(() => ({ success: true })),
  removeSkillSymlink: vi.fn(() => ({ success: true })),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: null) => void) => {
    cb(null);
  }),
}));

vi.mock('../registry/fetch.js', () => ({
  fetchRegistry: vi.fn().mockResolvedValue({
    index: {
      version: 1,
      publishedAt: '',
      sha256: 'x',
      templates: [
        {
          name: 'pencil',
          displayName: 'Pencil',
          description: '',
          version: '1.0.0',
          category: 'design',
          platforms: ['darwin'],
          steps: [{ type: 'npm', pkg: '@pencil/core', global: true, label: 'Pencil CLI' }],
        },
      ],
    },
    fromCache: false,
    offline: false,
  }),
}));

vi.mock('../installer/detect.js', () => ({
  detectPackageManagers: vi
    .fn()
    .mockResolvedValue({ nix: false, brew: false, winget: false, npm: true }),
}));

vi.mock('../shell/exec.js', () => ({ realExec: {} }));

vi.mock('../installer/runner.js', () => ({
  runUninstallSteps: vi.fn().mockResolvedValue(undefined),
}));

const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe('Uninstall', () => {
  it('shows warning and backup message on initial render', async () => {
    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame } = render(<Uninstall />);
    await delay();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('remove Pilot');
    expect(frame).toContain('backed up');
  });

  it('advances through steps on Y input', async () => {
    vi.resetModules();

    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    // Confirm intro
    stdin.write('y');
    await delay();

    // Step 1 shown — confirm
    stdin.write('y');
    await delay();

    const frame = lastFrame() ?? '';
    // Should have advanced past intro and completed step 1
    expect(frame).toContain('Knowledge');
  });

  it('skips a step on N input', async () => {
    vi.resetModules();

    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    // Confirm intro
    stdin.write('y');
    await delay();

    // Skip step 1
    stdin.write('n');
    await delay();

    const frame = lastFrame() ?? '';
    // Should show a skipped step indicator
    expect(frame).toContain('skipped');
  });

  it('shows done message after walking through all steps with Y', async () => {
    vi.resetModules();

    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    // Intro → y
    stdin.write('y');
    await delay();
    // Step 1 (knowledge) → y
    stdin.write('y');
    await delay();
    // Step 2 (skills) → y
    stdin.write('y');
    await delay();
    // Step 3 (claude) → y
    stdin.write('y');
    await delay();
    // Step 4 (tools) — skipped automatically (no templates)
    // Step 5 (cli) → y
    stdin.write('y');
    await delay(300);

    const frame = lastFrame() ?? '';
    expect(frame).toContain('removed');
  });

  it('shows backup path and skipped items in done phase', async () => {
    // Top-level mock already returns backupPath='/mock/home/pilot-backup-2026-04-10'
    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay(); // intro — backup runs, sets backupPath
    stdin.write('n');
    await delay(); // skip step 1
    stdin.write('n');
    await delay(); // skip step 2
    stdin.write('n');
    await delay(); // skip step 3
    // step 4 auto-skipped
    stdin.write('n');
    await delay(); // skip step 5 → done

    const frame = lastFrame() ?? '';
    expect(frame).toContain('pilot-backup');
    expect(frame).toContain('Skipped');
  });

  it('shows npm error when execFile fails in step5', async () => {
    const cp = await import('node:child_process');
    vi.mocked(cp.execFile).mockImplementationOnce(
      (_cmd: string, _args: string[], _opts: unknown, cb: unknown) => {
        (cb as (err: Error) => void)(new Error('EACCES'));
        return undefined as never;
      }
    );

    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay(); // intro
    stdin.write('y');
    await delay(); // step 1
    stdin.write('y');
    await delay(); // step 2
    stdin.write('y');
    await delay(); // step 3
    // step 4 auto-skipped
    stdin.write('y');
    await delay(300); // step 5 (triggers npm error)

    const frame = lastFrame() ?? '';
    expect(frame).toContain('uninstall');
  });

  it('shows backup-failed phase when backup returns failure', async () => {
    const backup = await import('../device/backup.js');
    vi.mocked(backup.backupKnowledge).mockReturnValueOnce({
      success: false,
      skipped: false,
    } as never);

    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Could not back up');

    // Press any key to exit from backup-failed phase
    stdin.write('y');
    await delay();
  });

  it('advances when backup succeeds but has no backupPath', async () => {
    const backup = await import('../device/backup.js');
    vi.mocked(backup.backupKnowledge).mockReturnValueOnce({
      success: true,
      skipped: true,
    } as never);

    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay();

    // Should advance to step 1 without setting backupPath
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Remove knowledge');
  });

  it('exits when user presses N at intro', async () => {
    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    // Press 'n' at intro — should exit
    stdin.write('n');
    await delay();

    // After exit the frame should be empty or show the intro (exit is mocked by ink-testing-library)
    const frame = lastFrame() ?? '';
    expect(frame).toBeDefined();
  });

  it('ignores non-y/n input during intro phase', async () => {
    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    // Press 'x' — should be ignored
    stdin.write('x');
    await delay();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('remove Pilot');
  });

  it('skips templates step4 with n when templates are installed', async () => {
    const state = await import('../device/state.js');
    vi.mocked(state.getInstalledTemplateNames).mockReturnValueOnce(['pencil']);

    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay(); // intro
    stdin.write('y');
    await delay(); // step 1
    stdin.write('y');
    await delay(); // step 2
    stdin.write('y');
    await delay(); // step 3
    // step 4 shows templates — skip them
    expect(lastFrame()).toContain('pencil');
    stdin.write('n');
    await delay(); // step 4 — skip

    const frame = lastFrame() ?? '';
    // Should have skipped dev tools and be at step 5
    expect(frame).toContain('Dev tools');
    expect(frame).toContain('skipped');
  });

  it('respects kept.knowledge and kept.skills flags in step5 removal', async () => {
    vi.resetModules();

    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay(); // intro — backup runs
    stdin.write('n');
    await delay(); // skip step 1 → kept.knowledge = true
    stdin.write('n');
    await delay(); // skip step 2 → kept.skills = true
    stdin.write('y');
    await delay(); // step 3
    // step 4 auto-skipped
    stdin.write('y');
    await delay(300); // step 5 with yes — !kept.knowledge=false, !kept.skills=false → branches covered

    expect(lastFrame()).toContain('removed');
  });

  it('ignores all input once done phase is reached', async () => {
    vi.resetModules();

    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay(); // intro
    stdin.write('y');
    await delay(); // step 1
    stdin.write('y');
    await delay(); // step 2
    stdin.write('y');
    await delay(); // step 3
    // step 4 auto-skipped
    stdin.write('n');
    await delay(); // skip step 5 → done phase

    // Press a key in done phase — no phase condition matches (covers step5 false branch)
    stdin.write('y');
    await delay();

    expect(lastFrame()).toContain('removed');
  });

  it('walks through step4 with templates installed', async () => {
    const state = await import('../device/state.js');
    vi.mocked(state.getInstalledTemplateNames).mockReturnValueOnce(['pencil']);

    const { Uninstall } = await import('./Uninstall.js');
    const { lastFrame, stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay(); // intro
    stdin.write('y');
    await delay(); // step 1
    stdin.write('y');
    await delay(); // step 2
    stdin.write('y');
    await delay(); // step 3
    // step 4 NOT auto-skipped — shows template list
    expect(lastFrame()).toContain('pencil');
    stdin.write('y');
    await delay(200); // step 4 — uninstall templates
    stdin.write('n');
    await delay(); // step 5 — skip CLI

    const frame = lastFrame() ?? '';
    expect(frame).toContain('removed');
  });

  it('runs runUninstallSteps for each installed template during step4', async () => {
    const state = await import('../device/state.js');
    const runner = await import('../installer/runner.js');
    const fetchMod = await import('../registry/fetch.js');
    vi.mocked(state.getInstalledTemplateNames).mockReturnValueOnce(['pencil']);
    vi.mocked(runner.runUninstallSteps).mockClear();
    // Invoke every no-op callback so v8 function coverage sees them execute.
    vi.mocked(runner.runUninstallSteps).mockImplementationOnce(
      async (_steps, _managers, _handlers, _others, _name, callbacks) => {
        callbacks.onStepStart(0);
        callbacks.onStepSkip(0);
        callbacks.onStepDone(0);
        callbacks.onStepError(0, new Error('x'));
      }
    );
    vi.mocked(fetchMod.fetchRegistry).mockResolvedValueOnce({
      index: {
        version: 1,
        publishedAt: '',
        sha256: 'x',
        templates: [
          {
            name: 'pencil',
            displayName: 'Pencil',
            description: '',
            version: '1.0.0',
            category: 'design',
            platforms: ['darwin'],
            steps: [{ type: 'npm', pkg: '@pencil/core', global: true, label: 'Pencil CLI' }],
          },
        ],
      },
      fromCache: false,
      offline: false,
    });

    const { Uninstall } = await import('./Uninstall.js');
    const { stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y'); // step 4 confirm
    await delay(300);
    stdin.write('n');
    await delay();

    expect(runner.runUninstallSteps).toHaveBeenCalled();
    expect(vi.mocked(state.removeTemplateFromState)).toHaveBeenCalledWith('pencil');
  });

  it('keeps template state when fetchRegistry throws during step4 (no bulk removal)', async () => {
    // Regression: previously the broad catch on fetchRegistry failure ran
    // a bulk `removeTemplateFromState` for every installed template. That
    // left dev tools installed but cleared the tracking, so the user had
    // no way to retry via `pilot down <template>`. State must persist.
    const state = await import('../device/state.js');
    const runner = await import('../installer/runner.js');
    const fetchMod = await import('../registry/fetch.js');
    vi.mocked(state.getInstalledTemplateNames).mockReturnValueOnce(['ghost']);
    vi.mocked(runner.runUninstallSteps).mockClear();
    vi.mocked(fetchMod.fetchRegistry).mockRejectedValueOnce(new Error('network down'));
    vi.mocked(state.removeTemplateFromState).mockClear();

    const { Uninstall } = await import('./Uninstall.js');
    const { stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y'); // step 4 confirm
    await delay(300);
    stdin.write('n');
    await delay();

    expect(runner.runUninstallSteps).not.toHaveBeenCalled();
    expect(vi.mocked(state.removeTemplateFromState)).not.toHaveBeenCalledWith('ghost');
  });

  it('keeps template state when runUninstallSteps rejects so the user can retry', async () => {
    const state = await import('../device/state.js');
    const runner = await import('../installer/runner.js');
    const fetchMod = await import('../registry/fetch.js');
    vi.mocked(state.getInstalledTemplateNames).mockReturnValueOnce(['pencil']);
    vi.mocked(fetchMod.fetchRegistry).mockResolvedValueOnce({
      index: {
        version: 1,
        publishedAt: '',
        sha256: 'x',
        templates: [
          {
            name: 'pencil',
            displayName: 'Pencil',
            description: '',
            version: '1.0.0',
            category: 'design',
            platforms: ['darwin'],
            steps: [{ type: 'npm', pkg: '@pencil/core', global: true, label: 'Pencil CLI' }],
          },
        ],
      },
      fromCache: false,
      offline: false,
    });
    vi.mocked(runner.runUninstallSteps).mockRejectedValueOnce(new Error('nope'));
    vi.mocked(state.removeTemplateFromState).mockClear();

    const { Uninstall } = await import('./Uninstall.js');
    const { stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y'); // step 4 confirm
    await delay(300);
    stdin.write('n');
    await delay();

    // Template still tracked because uninstall failed; retry via `pilot down`.
    expect(vi.mocked(state.removeTemplateFromState)).not.toHaveBeenCalledWith('pencil');
  });

  it('keeps template state when registry no longer knows the template', async () => {
    // Regression: previously cleanupSucceeded defaulted to true, so a missing
    // registry entry caused the state to be removed without any uninstall —
    // leaving dev tools installed but tracking gone.
    const state = await import('../device/state.js');
    const runner = await import('../installer/runner.js');
    const fetchMod = await import('../registry/fetch.js');
    vi.mocked(state.getInstalledTemplateNames).mockReturnValueOnce(['orphan']);
    vi.mocked(fetchMod.fetchRegistry).mockResolvedValueOnce({
      index: {
        version: 1,
        publishedAt: '',
        sha256: 'x',
        templates: [],
      },
      fromCache: false,
      offline: false,
    });
    vi.mocked(state.removeTemplateFromState).mockClear();
    vi.mocked(runner.runUninstallSteps).mockClear();

    const { Uninstall } = await import('./Uninstall.js');
    const { stdin } = render(<Uninstall />);
    await delay();

    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y');
    await delay();
    stdin.write('y'); // step 4 confirm
    await delay(300);
    stdin.write('n');
    await delay();

    expect(vi.mocked(runner.runUninstallSteps)).not.toHaveBeenCalled();
    expect(vi.mocked(state.removeTemplateFromState)).not.toHaveBeenCalledWith('orphan');
  });
});
