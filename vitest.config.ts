import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Business logic lives in src/lib; React pages/components are covered by the Playwright UAT, not unit tests.
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/__tests__/**', 'src/lib/**/*.test.ts', 'src/lib/db/types.ts', 'src/lib/provinces.ts', 'src/lib/thai-address-data.ts', 'src/lib/landing-content.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { lines: 60, functions: 60, branches: 50, statements: 60 },
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
