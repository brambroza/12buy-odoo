import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Unit tests never talk to Supabase: blank these so code that checks "is a database configured"
    // (e.g. the Odoo connection settings) takes the env-only path even when CI exports placeholders for the build.
    env: { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
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
