// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { readdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  addApp,
  deleteTargets,
  detectMachine,
  listApps,
  loadKitConfig,
  removeApp,
  renderStatus,
  runEdit,
  runInit,
  runUpdate,
  scaffoldKit,
  scanTargets,
} from '@medalsocial/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseAppsTarget,
  promptConfirm,
  resolveMachine,
  runKitApps,
  runKitClean,
  runKitConfigPath,
  runKitConfigShow,
  runKitEdit,
  runKitInit,
  runKitNew,
  runKitStatus,
  runKitUpdate,
} from './kit.js';

const { KitErrorStub } = vi.hoisted(() => {
  class KitErrorStub extends Error {
    cause?: unknown;
    constructor(msg: string, opts?: { cause?: unknown }) {
      super(msg);
      this.name = 'KitError';
      this.cause = opts?.cause;
    }
  }
  return { KitErrorStub };
});

vi.mock('@medalsocial/kit', () => ({
  KitError: KitErrorStub,
  errorCodes: {
    KIT_CONFIG_NOT_FOUND: 'KIT_CONFIG_NOT_FOUND',
    KIT_CONFIG_INVALID: 'KIT_CONFIG_INVALID',
    KIT_UNKNOWN_MACHINE: 'KIT_UNKNOWN_MACHINE',
  },
  configCandidates: vi.fn(() => ['/tmp/no.json']),
  loadKitConfig: vi.fn(),
  detectMachine: vi.fn(() => null),
  resolveProvider: vi.fn(() => ({ name: 'local' })),
  realExec: vi.fn(),
  realSudoKeeper: vi.fn(),
  runInit: vi.fn(),
  runUpdate: vi.fn(),
  renderStatus: vi.fn(),
  scaffoldKit: vi.fn(),
  listApps: vi.fn(() => ({ casks: [], brews: [] })),
  addApp: vi.fn(),
  removeApp: vi.fn(),
  runEdit: vi.fn(),
  scanTargets: vi.fn(),
  deleteTargets: vi.fn(),
  formatBytes: vi.fn((n: number) => `${n}B`),
}));

vi.mock('node:readline', () => ({
  createInterface: vi.fn(),
}));

vi.mock('ink', () => ({
  render: vi.fn(),
  Text: 'Text',
}));

vi.mock('node:fs', () => ({
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(),
}));

const baseConfig = {
  name: 'kit',
  repo: 'git@github.com:Medal-Social/kit.git',
  repoDir: '/tmp/kit',
  configPath: '/tmp/kit/kit.config.json',
  machines: {
    'ali-pro': { type: 'darwin' as const, user: 'ali' },
    'ada-air': { type: 'darwin' as const, user: 'ada' },
  },
};

beforeEach(() => {
  vi.mocked(loadKitConfig).mockResolvedValue(baseConfig);
  vi.mocked(readdirSync).mockReturnValue([]);
});

describe('parseAppsTarget', () => {
  it('defaults to cask when no prefix', () => {
    expect(parseAppsTarget('zed')).toEqual({ kind: 'casks', name: 'zed' });
  });

  it('strips brew: prefix', () => {
    expect(parseAppsTarget('brew:ripgrep')).toEqual({ kind: 'brews', name: 'ripgrep' });
  });

  it('strips cask: prefix (explicit)', () => {
    expect(parseAppsTarget('cask:zed')).toEqual({ kind: 'casks', name: 'zed' });
  });
});

describe('resolveMachine', () => {
  it('returns explicit override when present in config', () => {
    expect(resolveMachine(baseConfig, 'ada-air')).toBe('ada-air');
  });

  it('exits when explicit override is unknown', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => resolveMachine(baseConfig, 'mystery-host')).toThrow('exit');
    expect(err).toHaveBeenCalledWith(expect.stringContaining('Unknown machine'));
    exit.mockRestore();
    err.mockRestore();
  });

  it('falls back to first configured machine when detection misses', () => {
    const result = resolveMachine(baseConfig);
    expect(Object.keys(baseConfig.machines)).toContain(result);
  });

  it('returns detected machine when hostname matches a configured machine', () => {
    vi.mocked(detectMachine).mockReturnValueOnce('ali-pro');
    const result = resolveMachine(baseConfig);
    expect(result).toBe('ali-pro');
  });

  it('falls back with warning when detected hostname is not in config', () => {
    vi.mocked(detectMachine).mockReturnValueOnce('mystery-host');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = resolveMachine(baseConfig);
    expect(result).toBe('ali-pro'); // first configured machine
    expect(err).toHaveBeenCalledWith(expect.stringContaining('Hostname suggests'));
    err.mockRestore();
  });

  it('exits when config has no machines', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      resolveMachine({ ...baseConfig, machines: {} as typeof baseConfig.machines })
    ).toThrow('exit');
    expect(err).toHaveBeenCalledWith(expect.stringContaining('no machines'));
    exit.mockRestore();
    err.mockRestore();
  });
});

describe('runKitInit', () => {
  it('calls runInit with resolved machine', async () => {
    await runKitInit('ali-pro');
    expect(runInit).toHaveBeenCalledWith(expect.objectContaining({ machine: 'ali-pro' }));
  });

  it('propagates KitError via fail', async () => {
    vi.mocked(runInit).mockRejectedValue(new KitErrorStub('boom'));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitInit('ali-pro')).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
    vi.mocked(runInit).mockResolvedValue(undefined);
  });

  it('includes cause in KitError message when cause is present', async () => {
    vi.mocked(runInit).mockRejectedValue(
      new KitErrorStub('boom', { cause: new Error('root cause') })
    );
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitInit('ali-pro')).rejects.toThrow('exit');
    expect(err).toHaveBeenCalledWith(expect.stringContaining('root cause'));
    exit.mockRestore();
    err.mockRestore();
    vi.mocked(runInit).mockResolvedValue(undefined);
  });

  it('rethrows non-KitError', async () => {
    vi.mocked(runInit).mockRejectedValue(new TypeError('unexpected'));
    await expect(runKitInit('ali-pro')).rejects.toThrow('unexpected');
    vi.mocked(runInit).mockResolvedValue(undefined);
  });
});

describe('runKitNew', () => {
  it('calls scaffoldKit and renders success message', async () => {
    await runKitNew();
    expect(scaffoldKit).toHaveBeenCalled();
  });

  it('falls back to "me" when USER env var is not set', async () => {
    const origUser = process.env.USER;
    delete process.env.USER;
    await runKitNew();
    expect(scaffoldKit).toHaveBeenCalledWith(expect.objectContaining({ user: 'me' }));
    process.env.USER = origUser;
  });

  it('propagates KitError via fail on scaffold failure', async () => {
    vi.mocked(scaffoldKit).mockRejectedValue(new KitErrorStub('scaffold failed'));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitNew()).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
    vi.mocked(scaffoldKit).mockResolvedValue(undefined);
  });
});

describe('runKitUpdate', () => {
  it('calls runUpdate with hooks', async () => {
    vi.mocked(runUpdate).mockImplementationOnce(async ({ hooks }) => {
      hooks?.onPhaseStart?.('init' as never, 'Installing');
      hooks?.onPhaseEnd?.('init' as never, 'Installing', 'done');
    });
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitUpdate();
    expect(runUpdate).toHaveBeenCalled();
    write.mockRestore();
  });

  it('writes phase without detail when detail is omitted', async () => {
    vi.mocked(runUpdate).mockImplementationOnce(async ({ hooks }) => {
      hooks?.onPhaseStart?.('init' as never, 'Installing');
      hooks?.onPhaseEnd?.('init' as never, 'Installing', undefined);
    });
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitUpdate();
    expect(write).toHaveBeenCalled();
    write.mockRestore();
  });

  it('uses TTY escape codes when stdout is a TTY', async () => {
    vi.mocked(runUpdate).mockImplementationOnce(async ({ hooks }) => {
      hooks?.onPhaseStart?.('init' as never, 'Installing');
      hooks?.onPhaseEnd?.('init' as never, 'Installing', 'detail');
    });
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitUpdate();
    const output = write.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('\x1b[');
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    write.mockRestore();
  });

  it('formats duration as minutes when elapsed >= 60s', async () => {
    vi.mocked(runUpdate).mockResolvedValueOnce(undefined);
    const now = Date.now();
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now + 65_000);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitUpdate();
    const output = write.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('1m');
    write.mockRestore();
    nowSpy.mockRestore();
  });

  it('propagates KitError via fail', async () => {
    vi.mocked(runUpdate).mockRejectedValue(new KitErrorStub('update failed'));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await expect(runKitUpdate()).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
    write.mockRestore();
    vi.mocked(runUpdate).mockResolvedValue(undefined);
  });
});

describe('runKitStatus', () => {
  const report = {
    machineId: 'ali-pro',
    checks: [
      { status: 'ok' as const, label: 'Nix', detail: 'ok' },
      { status: 'warn' as const, label: 'SSH', detail: 'key missing', hint: 'Run ssh-keygen' },
      { status: 'error' as const, label: 'Repo', detail: 'missing', hint: 'Clone it' },
      { status: 'info' as const, label: 'OS', detail: 'macOS' },
      // no detail — covers c.detail ?? '' fallback
      { status: 'ok' as const, label: 'NoDetail' },
      // hint on non-warn/error status — covers the || branch false case
      { status: 'info' as const, label: 'Hinted', detail: 'x', hint: 'some hint' },
    ],
    orgPolicy: {
      apps: {
        source: 'remote',
        casks: [{ name: 'zed', reason: 'required' }],
        brews: [{ name: 'ripgrep', reason: 'required' }],
      },
      baseline: [{ id: 'filevault', description: 'Disk encryption' }],
    },
  };

  it('outputs JSON when opts.json is true', async () => {
    vi.mocked(renderStatus).mockResolvedValue(report as never);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitStatus({ json: true });
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"machineId"'));
    write.mockRestore();
  });

  it('outputs human-readable with all check statuses and org policy', async () => {
    vi.mocked(renderStatus).mockResolvedValue(report as never);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    await runKitStatus({});
    expect(write).toHaveBeenCalled();
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    write.mockRestore();
  });

  it('outputs human-readable without orgPolicy', async () => {
    const { orgPolicy: _, ...noPolicy } = report;
    vi.mocked(renderStatus).mockResolvedValue(noPolicy as never);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitStatus({});
    write.mockRestore();
  });

  it('outputs human-readable without orgPolicy when TTY', async () => {
    const { orgPolicy: _, ...noPolicy } = report;
    vi.mocked(renderStatus).mockResolvedValue(noPolicy as never);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    await runKitStatus({});
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    write.mockRestore();
  });

  it('propagates KitError via fail', async () => {
    vi.mocked(renderStatus).mockRejectedValue(new KitErrorStub('status failed'));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitStatus()).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
    vi.mocked(renderStatus).mockResolvedValue(report as never);
  });
});

describe('runKitConfigShow', () => {
  it('outputs JSON when not a TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitConfigShow();
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"repoDir"'));
    write.mockRestore();
  });

  it('outputs human-readable table when a TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitConfigShow();
    expect(write).toHaveBeenCalledWith(expect.stringContaining('kit config'));
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    write.mockRestore();
  });

  it('propagates KitError via fail', async () => {
    vi.mocked(loadKitConfig).mockRejectedValueOnce(new KitErrorStub('no config'));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitConfigShow()).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
  });
});

describe('runKitConfigPath', () => {
  it('writes config path to stdout', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitConfigPath();
    expect(write).toHaveBeenCalledWith('/tmp/kit/kit.config.json\n');
    write.mockRestore();
  });

  it('propagates KitError via fail', async () => {
    vi.mocked(loadKitConfig).mockRejectedValueOnce(new KitErrorStub('no config'));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitConfigPath()).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
  });
});

describe('runKitApps', () => {
  it('lists apps as JSON', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitApps('list');
    expect(listApps).toHaveBeenCalled();
    write.mockRestore();
  });

  it('finds machine apps.json when it exists directly in machines dir', async () => {
    vi.mocked(readdirSync).mockReturnValueOnce(['ali-pro.apps.json'] as never);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as never);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitApps('list');
    expect(listApps).toHaveBeenCalledWith(expect.stringContaining('ali-pro.apps.json'));
    write.mockRestore();
  });

  it('searches subdirectories for machine apps.json', async () => {
    vi.mocked(readdirSync)
      .mockReturnValueOnce(['subdir'] as never)
      .mockReturnValueOnce(['ali-pro.apps.json'] as never);
    vi.mocked(statSync).mockReturnValueOnce({ isDirectory: () => true } as never);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitApps('list');
    expect(listApps).toHaveBeenCalled();
    write.mockRestore();
  });

  it('skips entries when statSync throws in findMachineFile', async () => {
    vi.mocked(readdirSync).mockReturnValueOnce(['other-file', 'ali-pro.apps.json'] as never);
    vi.mocked(statSync).mockImplementationOnce(() => {
      throw new Error('EACCES');
    });
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitApps('list');
    expect(listApps).toHaveBeenCalledWith(expect.stringContaining('ali-pro.apps.json'));
    write.mockRestore();
  });

  it('falls back to default path when readdirSync throws for findMachineFile', async () => {
    vi.mocked(readdirSync).mockImplementationOnce(() => {
      throw new Error('ENOENT');
    });
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitApps('list');
    expect(listApps).toHaveBeenCalledWith(expect.stringContaining('ali-pro.apps.json'));
    write.mockRestore();
  });

  it('skips non-directory non-matching entries in findMachineFile', async () => {
    vi.mocked(readdirSync).mockReturnValueOnce(['some-other-file', 'ali-pro.apps.json'] as never);
    vi.mocked(statSync).mockReturnValueOnce({ isDirectory: () => false } as never);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitApps('list');
    expect(listApps).toHaveBeenCalledWith(expect.stringContaining('ali-pro.apps.json'));
    write.mockRestore();
  });

  it('falls back when subdirectory does not contain the machine file', async () => {
    vi.mocked(readdirSync)
      .mockReturnValueOnce(['subdir'] as never)
      .mockReturnValueOnce([] as never);
    vi.mocked(statSync).mockReturnValueOnce({ isDirectory: () => true } as never);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitApps('list');
    // findMachineFile returned null → machineFile used fallback path
    expect(listApps).toHaveBeenCalled();
    write.mockRestore();
  });

  it('adds a cask app', async () => {
    await runKitApps('add', 'zed');
    expect(addApp).toHaveBeenCalledWith(expect.any(String), 'zed', 'casks');
  });

  it('removes a brew app', async () => {
    await runKitApps('remove', 'brew:ripgrep');
    expect(removeApp).toHaveBeenCalledWith(expect.any(String), 'ripgrep', 'brews');
  });

  it('exits when name is missing for add/remove', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitApps('add')).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
  });

  it('exits on unknown action', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitApps('deploy', 'zed')).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
  });

  it('propagates KitError via fail', async () => {
    vi.mocked(addApp).mockRejectedValueOnce(new KitErrorStub('add failed'));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitApps('add', 'zed')).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
  });
});

describe('runKitEdit', () => {
  it('opens found nix file in editor', async () => {
    vi.mocked(readdirSync).mockReturnValue(['ali-pro.nix'] as never);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as never);
    await runKitEdit();
    expect(runEdit).toHaveBeenCalledWith(
      expect.stringContaining('ali-pro.nix'),
      expect.any(Object)
    );
  });

  it('exits when no nix file found', async () => {
    vi.mocked(readdirSync).mockReturnValue([]);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitEdit()).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
  });

  it('searches subdirectories for nix file', async () => {
    vi.mocked(readdirSync)
      .mockReturnValueOnce(['subdir'] as never)
      .mockReturnValueOnce(['ali-pro.nix'] as never);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as never);
    await runKitEdit();
    expect(runEdit).toHaveBeenCalled();
  });

  it('handles readdirSync failure gracefully', async () => {
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitEdit()).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
    vi.mocked(readdirSync).mockReturnValue([]);
  });

  it('skips entries when statSync throws in findMachineNix', async () => {
    vi.mocked(readdirSync).mockReturnValueOnce(['other-file', 'ali-pro.nix'] as never);
    vi.mocked(statSync).mockImplementationOnce(() => {
      throw new Error('EACCES');
    });
    await runKitEdit();
    expect(runEdit).toHaveBeenCalledWith(
      expect.stringContaining('ali-pro.nix'),
      expect.any(Object)
    );
    vi.mocked(readdirSync).mockReturnValue([]);
  });

  it('skips non-directory non-matching entries in findMachineNix', async () => {
    vi.mocked(readdirSync).mockReturnValueOnce(['other-file', 'ali-pro.nix'] as never);
    vi.mocked(statSync).mockReturnValueOnce({ isDirectory: () => false } as never);
    await runKitEdit();
    expect(runEdit).toHaveBeenCalledWith(
      expect.stringContaining('ali-pro.nix'),
      expect.any(Object)
    );
    vi.mocked(readdirSync).mockReturnValue([]);
  });

  it('exits when nix file is not found in subdirectory', async () => {
    vi.mocked(readdirSync)
      .mockReturnValueOnce(['subdir'] as never)
      .mockReturnValueOnce([] as never);
    vi.mocked(statSync).mockReturnValueOnce({ isDirectory: () => true } as never);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitEdit()).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
    vi.mocked(readdirSync).mockReturnValue([]);
  });

  it('propagates KitError via fail', async () => {
    vi.mocked(readdirSync).mockReturnValue(['ali-pro.nix'] as never);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as never);
    vi.mocked(runEdit).mockRejectedValueOnce(new KitErrorStub('editor failed'));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runKitEdit()).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
    vi.mocked(readdirSync).mockReturnValue([]);
  });
});

describe('promptConfirm', () => {
  interface FakeInterface {
    question(q: string, cb: (answer: string) => void): void;
    close(): void;
  }

  function stubInterface(answer: string): FakeInterface {
    return {
      question: (_q: string, cb: (a: string) => void) => cb(answer),
      close: vi.fn(),
    };
  }

  it('resolves true for "y"', async () => {
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('y') as never);
    await expect(promptConfirm('?')).resolves.toBe(true);
  });

  it('resolves true for uppercase "Y"', async () => {
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('Y') as never);
    await expect(promptConfirm('?')).resolves.toBe(true);
  });

  it('resolves true for "yes"', async () => {
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('yes') as never);
    await expect(promptConfirm('?')).resolves.toBe(true);
  });

  it('resolves true for "YES" (case-insensitive)', async () => {
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('YES') as never);
    await expect(promptConfirm('?')).resolves.toBe(true);
  });

  it('trims surrounding whitespace before matching', async () => {
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('  y  ') as never);
    await expect(promptConfirm('?')).resolves.toBe(true);
  });

  it('resolves false for "n"', async () => {
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('n') as never);
    await expect(promptConfirm('?')).resolves.toBe(false);
  });

  it('resolves false for "no"', async () => {
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('no') as never);
    await expect(promptConfirm('?')).resolves.toBe(false);
  });

  it('resolves false for empty response', async () => {
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('') as never);
    await expect(promptConfirm('?')).resolves.toBe(false);
  });
});

describe('runKitClean', () => {
  function stubInterface(answer: string) {
    return {
      question: (_q: string, cb: (a: string) => void) => cb(answer),
      close: vi.fn(),
    };
  }

  const fileTarget = {
    target: { id: 'cache', label: 'Caches', kind: 'files' as const },
    bytes: 1024,
  };
  const dockerTarget = {
    target: { id: 'docker', label: 'Docker', kind: 'docker' as const },
    bytes: 0,
  };

  it('writes "Nothing to clean" and exits early on empty scan', async () => {
    vi.mocked(scanTargets).mockResolvedValueOnce([]);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitClean();
    const output = write.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('Nothing to clean');
    expect(deleteTargets).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it('cancels when user declines (empty input resolves false)', async () => {
    vi.mocked(scanTargets).mockResolvedValueOnce([fileTarget] as never);
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('n') as never);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitClean();
    const output = write.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('Cancelled');
    expect(deleteTargets).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it('runs deleteTargets and shows progress when user confirms', async () => {
    vi.mocked(scanTargets).mockResolvedValueOnce([fileTarget, dockerTarget] as never);
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('y') as never);
    vi.mocked(deleteTargets).mockImplementationOnce(async (_targets, _exec, onResult) => {
      onResult?.({ id: 'cache', freed: 1024 } as never);
      onResult?.({ id: 'docker', freed: 0 } as never);
      return 1024;
    });
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitClean();
    const output = write.mock.calls.map((c) => c[0]).join('');
    expect(deleteTargets).toHaveBeenCalled();
    expect(output).toContain('freed');
    expect(output).toContain('All clear');
    write.mockRestore();
  });

  it('renders warnings for failed deletions', async () => {
    vi.mocked(scanTargets).mockResolvedValueOnce([fileTarget] as never);
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('y') as never);
    vi.mocked(deleteTargets).mockImplementationOnce(async (_targets, _exec, onResult) => {
      onResult?.({ id: 'cache', freed: 0, warning: 'EACCES' } as never);
      return 0;
    });
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitClean();
    const output = write.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('EACCES');
    write.mockRestore();
  });

  it('skips progress line for unknown target id (defensive guard)', async () => {
    vi.mocked(scanTargets).mockResolvedValueOnce([fileTarget] as never);
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('y') as never);
    vi.mocked(deleteTargets).mockImplementationOnce(async (_targets, _exec, onResult) => {
      onResult?.({ id: 'not-present', freed: 10 } as never);
      return 0;
    });
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await expect(runKitClean()).resolves.toBeUndefined();
    write.mockRestore();
  });

  it('uses TTY escape codes when stdout is a TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    vi.mocked(scanTargets).mockResolvedValueOnce([fileTarget] as never);
    vi.mocked(createInterface).mockReturnValueOnce(stubInterface('y') as never);
    vi.mocked(deleteTargets).mockResolvedValueOnce(1024);
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runKitClean();
    const output = write.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('\x1b[');
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    write.mockRestore();
  });

  it('propagates KitError via fail when scanTargets rejects', async () => {
    vi.mocked(scanTargets).mockRejectedValueOnce(new KitErrorStub('scan failed'));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await expect(runKitClean()).rejects.toThrow('exit');
    exit.mockRestore();
    err.mockRestore();
    write.mockRestore();
  });
});
