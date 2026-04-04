import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['server/src/**/*.spec.ts', 'server/src/**/*.test.ts'],
    globals: true,
    environment: 'node',
  },
});
