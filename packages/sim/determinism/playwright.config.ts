import { defineConfig } from '@playwright/test';

// Cross-engine determinism (SIM-08): the sim's goldens must come out identical in Chromium, Firefox and WebKit.
// Run with `pnpm test:determinism`; the browsers are installed once with
// `pnpm exec playwright install --with-deps chromium firefox webkit` (docs/09-engineering/testing.md).
export default defineConfig({
  testDir: '.',
  testMatch: '*.pw.ts',
  fullyParallel: true,
  forbidOnly: true,
  reporter: [['list']],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
