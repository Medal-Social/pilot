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
    },
  },
});
