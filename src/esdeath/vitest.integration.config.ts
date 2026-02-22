import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    globalSetup: ['tests/integration/setup.ts'],
    teardownTimeout: 30000,
  },
});
