import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

const PORT = process.env.SIGNALMAP_PORT ?? '8080';

// Live-mode Playwright config. Extends ./playwright.config.ts but:
// - testDir → ./e2e-live (live smoke specs)
// - webServer omitted (compose stack is brought up externally)
// - baseURL parameterized via SIGNALMAP_PORT (default 8080) so this can run
//   against the same stack the Phase 5 checkpoint test uses on a non-default port.
const { webServer: _baseWebServer, ...rest } = baseConfig;

export default defineConfig({
  ...rest,
  testDir: './e2e-live',
  use: {
    ...rest.use,
    baseURL: `http://localhost:${PORT}`,
  },
});
