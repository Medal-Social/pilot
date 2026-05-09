// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest';
import type { CleanTarget, ScannedTarget } from './clean.js';
import { CLEAN_TARGETS, deleteTarget, deleteTargets, formatBytes, scanTargets } from './clean.js';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1.0 MB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
    [1024 ** 3, '1.0 GB'],
    [2.3 * 1024 ** 3, '2.3 GB'],
  ])('formatBytes(%i) → "%s"', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});

describe('CLEAN_TARGETS', () => {
  it('contains the required target ids', () => {
    const ids = CLEAN_TARGETS.map((t) => t.id);
    for (const id of [
      'system-caches',
      'system-logs',
      'trash',
      'xcode-derived',
      'simulator-caches',
      'brew',
      'npm',
      'pnpm',
      'yarn',
      'gradle',
      'maven',
      'docker',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('does not include child targets of system-caches', () => {
    // ~/Library/Caches/pip was removed because it was a child of the
    // `system-caches` target (~/Library/Caches), which caused double-counting.
    const systemCaches = CLEAN_TARGETS.find((t) => t.id === 'system-caches');
    expect(systemCaches).toBeDefined();
    const cachesPath = systemCaches?.path ?? '';
    const overlaps = CLEAN_TARGETS.filter(
      (t) => t.id !== 'system-caches' && t.path?.startsWith(`${cachesPath}/`)
    );
    expect(overlaps).toEqual([]);
  });

  it('all path-kind targets have a path defined', () => {
    for (const t of CLEAN_TARGETS.filter((t) => t.kind === 'path')) {
      expect(t.path).toBeDefined();
    }
  });

  it('docker target has kind "docker" and no path', () => {
    const docker = CLEAN_TARGETS.find((t) => t.id === 'docker');
    expect(docker?.kind).toBe('docker');
    expect(docker?.path).toBeUndefined();
  });
});

describe('scanTargets', () => {
  it('returns empty array when all targets are missing or unavailable', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: 'not found', code: 1 }),
      spawn: vi.fn(),
    };
    const result = await scanTargets(exec);
    expect(result).toHaveLength(0);
  });

  it('includes a path target when du reports non-zero bytes', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
        if (_cmd === 'du') return { stdout: `2048\t${args[1]}\n`, stderr: '', code: 0 };
        return { stdout: '', stderr: '', code: 1 };
      }),
      spawn: vi.fn(),
    };
    const custom: CleanTarget[] = [
      { id: 'test-path', label: 'Test', kind: 'path', path: '/test/path' },
    ];
    const result = await scanTargets(exec, custom);
    expect(result).toHaveLength(1);
    expect(result[0].bytes).toBe(2048 * 1024);
    expect(result[0].target.id).toBe('test-path');
  });

  it('excludes a path target when du returns zero bytes', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '0\t/path\n', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const custom: CleanTarget[] = [
      { id: 'test-path', label: 'Test', kind: 'path', path: '/test/path' },
    ];
    const result = await scanTargets(exec, custom);
    expect(result).toHaveLength(0);
  });

  it('excludes path targets without a path', async () => {
    const exec = {
      run: vi.fn(),
      spawn: vi.fn(),
    };
    const custom: CleanTarget[] = [{ id: 'missing-path', label: 'Missing', kind: 'path' }];

    await expect(scanTargets(exec, custom)).resolves.toEqual([]);
    expect(exec.run).not.toHaveBeenCalled();
  });

  it('treats unparseable du output as zero bytes', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: 'not-a-number\t/path\n', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const custom: CleanTarget[] = [
      { id: 'test-path', label: 'Test', kind: 'path', path: '/test/path' },
    ];

    await expect(scanTargets(exec, custom)).resolves.toEqual([]);
  });

  it('includes docker target when docker info exits 0', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string) => {
        if (cmd === 'docker') return { stdout: '', stderr: '', code: 0 };
        return { stdout: '', stderr: '', code: 1 };
      }),
      spawn: vi.fn(),
    };
    const custom: CleanTarget[] = [{ id: 'docker', label: 'Docker', kind: 'docker' }];
    const result = await scanTargets(exec, custom);
    expect(result).toHaveLength(1);
    expect(result[0].bytes).toBe(0);
  });

  it('excludes docker target when docker info exits non-zero', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 1 }),
      spawn: vi.fn(),
    };
    const custom: CleanTarget[] = [{ id: 'docker', label: 'Docker', kind: 'docker' }];
    const result = await scanTargets(exec, custom);
    expect(result).toHaveLength(0);
  });

  it('resolves brew cache path and measures it', async () => {
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'brew' && args[0] === '--cache') {
          return { stdout: '/usr/local/Cellar/cache\n', stderr: '', code: 0 };
        }
        if (cmd === 'du') return { stdout: `4096\t${args[1]}\n`, stderr: '', code: 0 };
        return { stdout: '', stderr: '', code: 1 };
      }),
      spawn: vi.fn(),
    };
    const custom: CleanTarget[] = [{ id: 'brew', label: 'Homebrew cache', kind: 'brew' }];
    const result = await scanTargets(exec, custom);
    expect(result).toHaveLength(1);
    expect(result[0].target.path).toBe('/usr/local/Cellar/cache');
    expect(result[0].bytes).toBe(4096 * 1024);
  });

  it('excludes brew target when brew is not installed', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 1 }),
      spawn: vi.fn(),
    };
    const custom: CleanTarget[] = [{ id: 'brew', label: 'Homebrew cache', kind: 'brew' }];
    const result = await scanTargets(exec, custom);
    expect(result).toHaveLength(0);
  });
});

describe('deleteTarget', () => {
  it('runs rm -rf for a non-contentsOnly path target', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const scanned: ScannedTarget = {
      target: { id: 'npm', label: 'npm cache', kind: 'path', path: '/home/.npm/_cacache' },
      bytes: 1024 * 1024,
    };
    const result = await deleteTarget(exec, scanned);
    expect(exec.run).toHaveBeenCalledWith('rm', ['-rf', '/home/.npm/_cacache']);
    expect(result.freed).toBe(1024 * 1024);
    expect(result.warning).toBeUndefined();
  });

  it('runs find for a contentsOnly path target', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const scanned: ScannedTarget = {
      target: {
        id: 'system-caches',
        label: 'System Caches',
        kind: 'path',
        path: '/Users/x/Library/Caches',
        contentsOnly: true,
      },
      bytes: 500 * 1024 * 1024,
    };
    await deleteTarget(exec, scanned);
    expect(exec.run).toHaveBeenCalledWith('find', [
      '/Users/x/Library/Caches',
      '-mindepth',
      '1',
      '-maxdepth',
      '1',
      '-exec',
      'rm',
      '-rf',
      '{}',
      '+',
    ]);
  });

  it('returns a warning and freed=0 when delete fails', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: 'Permission denied', code: 1 }),
      spawn: vi.fn(),
    };
    const scanned: ScannedTarget = {
      target: { id: 'npm', label: 'npm cache', kind: 'path', path: '/home/.npm/_cacache' },
      bytes: 1024,
    };
    const result = await deleteTarget(exec, scanned);
    expect(result.freed).toBe(0);
    expect(result.warning).toContain('Permission denied');
  });

  it('runs docker system prune and parses freed bytes', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({
        stdout: 'Deleted Images:\nabc\n\nTotal reclaimed space: 1.234GB\n',
        stderr: '',
        code: 0,
      }),
      spawn: vi.fn(),
    };
    const scanned: ScannedTarget = {
      target: { id: 'docker', label: 'Docker', kind: 'docker' },
      bytes: 0,
    };
    const result = await deleteTarget(exec, scanned);
    expect(exec.run).toHaveBeenCalledWith('docker', ['system', 'prune', '-f']);
    expect(result.freed).toBeGreaterThan(0);
    expect(result.warning).toBeUndefined();
  });

  it.each([
    ['1.5TB', Math.round(1.5 * 1024 ** 4)],
    ['2MB', 2 * 1024 ** 2],
    ['3kB', 3 * 1024],
    ['12B', 12],
    ['.GB', 0],
  ])('parses docker reclaimed size %s', async (size, expected) => {
    const exec = {
      run: vi
        .fn()
        .mockResolvedValue({ stdout: `Total reclaimed space: ${size}\n`, stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const scanned: ScannedTarget = {
      target: { id: 'docker', label: 'Docker', kind: 'docker' },
      bytes: 0,
    };

    await expect(deleteTarget(exec, scanned)).resolves.toEqual({ id: 'docker', freed: expected });
  });

  it('returns zero when docker prune does not report reclaimed space', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: 'Nothing to prune\n', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const scanned: ScannedTarget = {
      target: { id: 'docker', label: 'Docker', kind: 'docker' },
      bytes: 0,
    };

    await expect(deleteTarget(exec, scanned)).resolves.toEqual({ id: 'docker', freed: 0 });
  });

  it('returns a warning when a non-docker target has no path', async () => {
    const exec = {
      run: vi.fn(),
      spawn: vi.fn(),
    };
    const scanned: ScannedTarget = {
      target: { id: 'bad', label: 'Bad', kind: 'path' },
      bytes: 0,
    };

    await expect(deleteTarget(exec, scanned)).resolves.toEqual({
      id: 'bad',
      freed: 0,
      warning: 'target bad has no path',
    });
    expect(exec.run).not.toHaveBeenCalled();
  });

  it('returns a docker warning when prune exits non-zero', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: 'Cannot connect', code: 1 }),
      spawn: vi.fn(),
    };
    const scanned: ScannedTarget = {
      target: { id: 'docker', label: 'Docker', kind: 'docker' },
      bytes: 0,
    };
    const result = await deleteTarget(exec, scanned);
    expect(result.freed).toBe(0);
    expect(result.warning).toContain('Cannot connect');
  });
});

describe('deleteTargets', () => {
  it('calls onProgress for each target and returns total freed', async () => {
    const exec = {
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
      spawn: vi.fn(),
    };
    const targets: ScannedTarget[] = [
      { target: { id: 'npm', label: 'npm cache', kind: 'path', path: '/a' }, bytes: 1024 * 1024 },
      {
        target: { id: 'pip', label: 'pip cache', kind: 'path', path: '/b' },
        bytes: 2 * 1024 * 1024,
      },
    ];
    const seen: string[] = [];
    const total = await deleteTargets(targets, exec, (r) => {
      seen.push(r.id);
    });
    expect(seen).toContain('npm');
    expect(seen).toContain('pip');
    expect(total).toBe(3 * 1024 * 1024);
  });

  it('runs docker target after file targets', async () => {
    const order: string[] = [];
    const exec = {
      run: vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'docker') order.push('docker');
        else if (args[0] === '-rf') order.push('rm');
        return { stdout: 'Total reclaimed space: 0B\n', stderr: '', code: 0 };
      }),
      spawn: vi.fn(),
    };
    const targets: ScannedTarget[] = [
      { target: { id: 'npm', label: 'npm', kind: 'path', path: '/a' }, bytes: 1024 },
      { target: { id: 'docker', label: 'Docker', kind: 'docker' }, bytes: 0 },
    ];
    await deleteTargets(targets, exec, () => {});
    const dockerIdx = order.lastIndexOf('docker');
    const rmIdx = order.indexOf('rm');
    expect(rmIdx).toBeLessThan(dockerIdx);
  });
});
