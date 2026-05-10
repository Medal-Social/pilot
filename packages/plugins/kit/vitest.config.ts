import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 97,
        branches: 90,
        functions: 97,
        lines: 97,
      },
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/types.ts',
        '**/*.d.ts',
        // medal-connect/watch.ts has many platform-dependent fs.watch
        // branches (recursive on darwin/windows but not linux, ENOENT
        // fallbacks for fresh clones, branch-ref rewiring on git checkout)
        // that are exercised end-to-end via the agent runtime tests in
        // @medalsocial/pilot rather than per-branch in kit unit tests.
        // The integration boundary is what matters; per-platform branches
        // are tracked under v1.1 hardening (vault followup item 5).
        'src/medal-connect/watch.ts',
      ],
    },
  },
});
