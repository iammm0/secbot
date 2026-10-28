import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: [
      'server/src/**/*.spec.ts',
      'server/src/**/*.test.ts',
      'web/src/**/*.test.ts',
      'terminal-ui/src/**/*.test.ts',
      'scripts/**/*.test.mjs',
    ],
    globals: true,
    environment: 'node',
    passWithNoTests: true,
  },
});
