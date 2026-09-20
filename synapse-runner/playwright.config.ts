import { defineConfig } from '@playwright/test';

/**
 * Config mínima de Playwright para synapse-runner.
 *
 * fullyParallel=false y workers=1 a propósito: las 4 superficies de Fases
 * 1-4 (Electron/Discovery/Companion/CLI) comparten UN único
 * Chromium/Electron real levantado por Nucleus/Sentinel — no tiene sentido
 * paralelizar tests que compiten por el mismo perfil de browser. La quinta
 * superficie (0, browser genérico pre-Electron, Fase 0 server-side) sigue
 * como stub — ver tests/e2e/phase0-server-onboarding.spec.ts — y cuando
 * deje de serlo, corre en su propio browser desechable, ANTES y separado
 * de este, no en paralelo con él.
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
