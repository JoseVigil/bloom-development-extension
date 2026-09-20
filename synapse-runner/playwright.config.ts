import { defineConfig } from '@playwright/test';

/**
 * Config mínima de Playwright para synapse-runner.
 *
 * fullyParallel=false y workers=1 a propósito: las 4 superficies comparten
 * UN único Chromium/Electron real levantado por Nucleus/Sentinel — no tiene
 * sentido paralelizar tests que compiten por el mismo perfil de browser.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
