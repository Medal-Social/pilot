// Copyright (c) Medal Social. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { buildProgram } from './program.js';
import type { PilotSettings } from './settings.js';

async function loadCompletion(shell: 'bash' | 'zsh' | 'fish'): Promise<string> {
  const { runCompletions } = await import('./commands/completions.js');
  // runCompletions writes to stdout; capture it.
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((s: string | Uint8Array) => {
    chunks.push(typeof s === 'string' ? s : Buffer.from(s).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;
  try {
    await runCompletions(shell);
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join('');
}

describe('shell completions parity', () => {
  // Build with a stub settings object so the kit branch is registered
  // regardless of disk state.
  function programNames(): string[] {
    const settings: PilotSettings = {
      onboarded: true,
      plugins: { '@medalsocial/kit': { enabled: true } },
      mcpServers: {},
      crew: { specialists: {} },
    };
    const program = buildProgram(settings);
    return program.commands.map((c) => c.name());
  }

  for (const shell of ['bash', 'zsh', 'fish'] as const) {
    it(`${shell} completion contains every registered top-level command`, async () => {
      const names = programNames();
      const script = await loadCompletion(shell);
      const missing = names.filter((n) => !script.includes(n));
      expect(missing, `${shell} completion is missing: ${missing.join(', ')}`).toEqual([]);
    });
  }
});
