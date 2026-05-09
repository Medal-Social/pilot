import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 100,
        lines: 95,
      },
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/types.ts',
        '**/*.d.ts',
        '**/bin/pilot.ts',
        // program.ts is the command-wiring entry point extracted from bin/pilot.ts;
        // exercised end-to-end via the CLI, not via direct unit tests of every
        // commander action handler.
        '**/program.ts',
        // Pure re-export shim from shell/exec.ts (the real impl is tested there);
        // v8 coverage counts the re-exports as uncovered functions.
        '**/installer/exec.ts',
      ],
    },
  },
});
