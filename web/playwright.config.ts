import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const metaDb = path.join(os.tmpdir(), 'lakehouse-ui-e2e-meta.db');

// Each run starts from an empty meta.db — certification flags and usage
// events are state and must not leak between runs.
fs.rmSync(metaDb, { force: true });

/**
 * Playwright smoke (AGENTS.md §1): boots the canonical deployment shape —
 * the Hono API serving the built Angular SPA from web/dist — against the
 * artifact fixtures, then exercises the catalog end to end.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node api/dist/server.js',
    cwd: repoRoot,
    url: 'http://127.0.0.1:4321/api/health',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
    env: {
      HOST: '127.0.0.1',
      PORT: '4321',
      LAKEHOUSE_ARTIFACTS_DIR: path.join(repoRoot, 'api', 'test', 'fixtures', 'artifacts'),
      LAKEHOUSE_META_DB: metaDb,
      WEB_DIST_DIR: path.join(repoRoot, 'web', 'dist', 'lakehouse-ui'),
    },
  },
});
