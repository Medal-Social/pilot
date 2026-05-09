import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  main,
  releaseAssetUrl,
  stampFormula,
  versionFromTag,
} from '../scripts/update-tap-formula.mjs';

// The checked-in source formula — also the input the workflow gives the
// stamper. Kept inline so the test fails loudly if the source shape diverges
// from what the script understands (placeholders, latest URLs, no version).
const SOURCE_FORMULA = `class Pilot < Formula
  desc "Your AI crew, ready to fly. Medal Social's AI-powered CLI platform."
  homepage "https://github.com/Medal-Social/Pilot"
  license "Apache-2.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/Medal-Social/Pilot/releases/latest/download/pilot-darwin-arm64"
      sha256 "PLACEHOLDER" # darwin-arm64

      def install
        bin.install "pilot-darwin-arm64" => "pilot"
      end
    else
      url "https://github.com/Medal-Social/Pilot/releases/latest/download/pilot-darwin-x64"
      sha256 "PLACEHOLDER" # darwin-x64

      def install
        bin.install "pilot-darwin-x64" => "pilot"
      end
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/Medal-Social/Pilot/releases/latest/download/pilot-linux-arm64"
      sha256 "PLACEHOLDER" # linux-arm64

      def install
        bin.install "pilot-linux-arm64" => "pilot"
      end
    else
      url "https://github.com/Medal-Social/Pilot/releases/latest/download/pilot-linux-x64"
      sha256 "PLACEHOLDER" # linux-x64

      def install
        bin.install "pilot-linux-x64" => "pilot"
      end
    end
  end

  test do
    assert_match "pilot", shell_output("#{bin}/pilot --version")
  end
end
`;

const SHAS = {
  darwinArm64: '383e81d8f4846e26d1319d91066d3ee752dfa68ce7a4bcdee484ed119666db39',
  darwinX64: '0727aaf9c6b2433d3ffd8b8333d9646241bd1f2ed646783f7b4f60ff76fcada8',
  linuxArm64: '6bcabb454b284a85d9c9fe82e29ec4215d0632364fc0baabfea25c621282fd73',
  linuxX64: '82f1fc2d1b091ec2356cb151df405b50dc290a68069ade7cbe28e7f559b039e1',
};

describe('versionFromTag', () => {
  it('strips the @medalsocial/pilot@ prefix', () => {
    expect(versionFromTag('@medalsocial/pilot@0.5.1')).toBe('0.5.1');
  });

  it('accepts pre-release suffixes', () => {
    expect(versionFromTag('@medalsocial/pilot@1.0.0-rc.1')).toBe('1.0.0-rc.1');
  });

  it('throws for tags missing the prefix', () => {
    expect(() => versionFromTag('v0.5.1')).toThrow(/must start with/);
  });

  it('throws when the suffix is not SemVer-shaped', () => {
    expect(() => versionFromTag('@medalsocial/pilot@nightly')).toThrow(/SemVer/);
  });
});

describe('releaseAssetUrl', () => {
  it('builds the percent-encoded GitHub releases/download URL', () => {
    expect(releaseAssetUrl('0.5.1', 'pilot-darwin-arm64')).toBe(
      'https://github.com/Medal-Social/Pilot/releases/download/%40medalsocial/pilot%400.5.1/pilot-darwin-arm64'
    );
  });
});

describe('stampFormula', () => {
  it('produces a formula with version + tag-pinned URLs + real shas', () => {
    const out = stampFormula(SOURCE_FORMULA, { version: '0.5.1', shas: SHAS });

    // Issue 1 fix #1: explicit version line so brew sees an upgrade.
    expect(out).toContain('  version "0.5.1"');

    // Issue 1 fix #2: tag-pinned URLs, no `releases/latest`.
    expect(out).not.toContain('releases/latest/download');
    for (const asset of [
      'pilot-darwin-arm64',
      'pilot-darwin-x64',
      'pilot-linux-arm64',
      'pilot-linux-x64',
    ]) {
      expect(out).toContain(
        `https://github.com/Medal-Social/Pilot/releases/download/%40medalsocial/pilot%400.5.1/${asset}`
      );
    }

    // SHA placeholders replaced for each asset.
    expect(out).toContain(`sha256 "${SHAS.darwinArm64}" # darwin-arm64`);
    expect(out).toContain(`sha256 "${SHAS.darwinX64}" # darwin-x64`);
    expect(out).toContain(`sha256 "${SHAS.linuxArm64}" # linux-arm64`);
    expect(out).toContain(`sha256 "${SHAS.linuxX64}" # linux-x64`);
    expect(out).not.toContain('PLACEHOLDER');
  });

  it('inserts version exactly once (idempotent re-run on already-stamped formula)', () => {
    const once = stampFormula(SOURCE_FORMULA, { version: '0.5.1', shas: SHAS });
    const twice = stampFormula(once, { version: '0.6.0', shas: SHAS });

    // Second pass leaves the previously-stamped version line alone (no duplicate).
    const versionLines = twice.match(/^\s*version\s+"/gm) ?? [];
    expect(versionLines).toHaveLength(1);
  });

  it('throws when version is missing', () => {
    expect(() => stampFormula(SOURCE_FORMULA, { version: '', shas: SHAS })).toThrow(
      /version is required/
    );
  });

  it('throws when shas is missing', () => {
    // @ts-expect-error — deliberately omitting shas
    expect(() => stampFormula(SOURCE_FORMULA, { version: '0.5.1' })).toThrow(/shas is required/);
  });

  it('leaves PLACEHOLDER in place when a sha is missing for an asset', () => {
    const out = stampFormula(SOURCE_FORMULA, {
      version: '0.5.1',
      shas: { ...SHAS, darwinArm64: undefined as unknown as string },
    });
    expect(out).toContain('sha256 "PLACEHOLDER" # darwin-arm64');
    // Other assets still get their real sha.
    expect(out).toContain(`sha256 "${SHAS.linuxX64}" # linux-x64`);
  });
});

describe('main (file IO + env)', () => {
  let dir: string;
  let formulaPath: string;
  // Capture stdout/stderr so the messages emitted by main() don't leak into
  // the test runner's output.
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  let stdout: string;
  let stderr: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tap-formula-'));
    formulaPath = join(dir, 'pilot.rb');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function captureStdio(): void {
    stdout = '';
    stderr = '';
    process.stdout.write = ((s: string | Uint8Array) => {
      stdout += typeof s === 'string' ? s : Buffer.from(s).toString('utf8');
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((s: string | Uint8Array) => {
      stderr += typeof s === 'string' ? s : Buffer.from(s).toString('utf8');
      return true;
    }) as typeof process.stderr.write;
  }

  function restoreStdio(): void {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  }

  it('writes a stamped formula to FORMULA_PATH on success', async () => {
    await writeFile(formulaPath, SOURCE_FORMULA);
    captureStdio();
    let code: number;
    try {
      code = await main([], {
        TAG_NAME: '@medalsocial/pilot@0.5.1',
        FORMULA_PATH: formulaPath,
        SHA_pilot_darwin_arm64: SHAS.darwinArm64,
        SHA_pilot_darwin_x64: SHAS.darwinX64,
        SHA_pilot_linux_arm64: SHAS.linuxArm64,
        SHA_pilot_linux_x64: SHAS.linuxX64,
      });
    } finally {
      restoreStdio();
    }
    expect(code).toBe(0);
    expect(stdout).toContain(`Stamped ${formulaPath}`);
    expect(stderr).toBe('');
    const out = await readFile(formulaPath, 'utf8');
    expect(out).toContain('  version "0.5.1"');
    expect(out).not.toContain('releases/latest/download');
  });

  it('returns 1 with a stderr message when TAG_NAME is missing', async () => {
    captureStdio();
    let code: number;
    try {
      code = await main([], {});
    } finally {
      restoreStdio();
    }
    expect(code).toBe(1);
    expect(stderr).toContain('TAG_NAME is required');
  });

  it('returns 1 with a stderr message when a SHA env var is missing', async () => {
    captureStdio();
    let code: number;
    try {
      code = await main([], {
        TAG_NAME: '@medalsocial/pilot@0.5.1',
        FORMULA_PATH: formulaPath,
        SHA_pilot_darwin_arm64: SHAS.darwinArm64,
        // SHA_pilot_darwin_x64 omitted on purpose
        SHA_pilot_linux_arm64: SHAS.linuxArm64,
        SHA_pilot_linux_x64: SHAS.linuxX64,
      });
    } finally {
      restoreStdio();
    }
    expect(code).toBe(1);
    expect(stderr).toContain('Missing SHA256');
  });
});

describe('repo source formula matches the test fixture', () => {
  it('homebrew-pilot/pilot.rb is the same shape stampFormula expects', async () => {
    const repoFormula = await readFile(
      fileURLToPath(new URL('../homebrew-pilot/pilot.rb', import.meta.url)),
      'utf8'
    );
    // If this fails, update the SOURCE_FORMULA fixture above (or fix the
    // repo source if it drifted from the documented shape).
    expect(repoFormula).toBe(SOURCE_FORMULA);
  });
});

describe('CLI invocation (end-to-end)', () => {
  // Spawn the script as a real process so we exercise the
  // `import.meta.url === resolvePath(process.argv[1])` guard. A previous
  // version compared raw argv[1] (which can be relative) against the
  // resolved fileURL, so the guard never matched and main() was never
  // executed — silently shipping the placeholder formula to the tap.
  it('exits non-zero with a stderr message when TAG_NAME is missing', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const scriptPath = fileURLToPath(new URL('../scripts/update-tap-formula.mjs', import.meta.url));

    let exitCode: number | null = null;
    let stderr = '';
    let stdout = '';
    try {
      const result = await execFileAsync(process.execPath, [scriptPath], {
        env: { PATH: process.env.PATH ?? '' },
      });
      stdout = result.stdout;
      stderr = result.stderr;
      exitCode = 0;
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string };
      exitCode = err.code ?? -1;
      stdout = err.stdout ?? '';
      stderr = err.stderr ?? '';
    }
    expect(exitCode).toBe(1);
    expect(stderr).toContain('TAG_NAME is required');
    expect(stdout).toBe('');
  });
});
