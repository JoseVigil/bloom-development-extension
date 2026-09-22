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
  // 240s (era 120s) — confirmado esta sesión: launchConductor() espera hasta
  // 150s por firstWindow() (bootServices()/`nucleus dev-start` en
  // main_conductor.js tiene su propio timeout interno de 120s — "Temporal
  // cold start + Brain + Control Plane", comentario del archivo real). Con
  // el timeout global en 120s, el test entero moría ANTES de que ese wait de
  // 150s pudiera resolver o fallar por sí mismo — el fallo real observado
  // fue "Test timeout of 120000ms exceeded", no un TimeoutError de
  // firstWindow(), y Playwright mata el proceso a la fuerza en ese punto sin
  // darle chance de reportar la causa real. 240s = 150s del wait de Conductor
  // + margen para 00a/00b y los pasos posteriores (backend_identity_check,
  // 01_launch, etc.).
  timeout: 240_000,
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
