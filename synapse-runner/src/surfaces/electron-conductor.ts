import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { env } from '../config/env';
import { getBloomPaths } from '../config/bloom-paths';

/**
 * Superficie 1 de 5 — `_electron.launch()`, ventana Conductor (Sección 4,
 * punto 1 del dossier / §7 del Requerimiento Integrado). Asume que la Fase
 * 0 server-side (pasos 00a-00d — registro, login GitHub del backend,
 * descarga e instalación) ya terminó antes de este launch; esa fase vive en
 * `src/surfaces/phase0-generic-browser.ts` como stub, todavía sin
 * implementar.
 *
 * El bridge IPC real (window.onboarding / window.electronAPI) lo expone
 * installer/conductor/workspace/onboarding/preload_onboarding.js — este
 * módulo asume esa forma (confirmada por Sección 2A del dossier) pero NO
 * asume los nombres exactos de cada evento de milestone: esos viven en
 * milestone-registry.js / milestone-reactor.js y no fueron auditados campo
 * por campo en esta sesión (no era parte de los puntos bloqueantes de la
 * Sección 7). waitForMilestone() queda genérico a propósito — pasale el
 * nombre de evento tal como lo emite milestone-reactor.js.
 */

export interface ConductorHandle {
  app: ElectronApplication;
  mainWindow: Page;
  close(): Promise<void>;
}

export async function launchConductor(): Promise<ConductorHandle> {
  const exePath = resolveConductorExePath();

  const app = await electron.launch({
    executablePath: exePath,
    // Nucleus/Sentinel spawnean su propio Chromium por fuera de Electron
    // (Sección 1: "Brain/Nucleus — spawnea Chromium + perfil") — Conductor
    // en sí es solo la ventana desktop.
  });

  const mainWindow = await app.firstWindow();
  await mainWindow.waitForLoadState('domcontentloaded');

  return {
    app,
    mainWindow,
    async close() {
      await app.close();
    },
  };
}

function resolveConductorExePath(): string {
  if (env.conductorExePathOverride) {
    if (!existsSync(env.conductorExePathOverride)) {
      throw new Error(
        `[electron-conductor] CONDUCTOR_EXE_PATH apunta a un archivo inexistente: ${env.conductorExePathOverride}`,
      );
    }
    return env.conductorExePathOverride;
  }

  const paths = getBloomPaths();
  const ext = process.platform === 'win32' ? '.exe' : '';
  const candidate = `${paths.binDir}/conductor/bloom-conductor${ext}`;
  if (!existsSync(candidate)) {
    throw new Error(
      `[electron-conductor] No se encontró el ejecutable de Conductor en ${candidate}. ` +
        `Seteá CONDUCTOR_EXE_PATH en .env si tu instalación de desarrollo usa otra ruta.`,
    );
  }
  return candidate;
}

/**
 * Espera un milestone expuesto por el bridge IPC (window.onboarding /
 * window.electronAPI, ver preload_onboarding.js). El nombre exacto del
 * evento y su forma de suscripción (EventEmitter-like vs callback) deben
 * confirmarse contra onboarding-handlers.js / milestone-registry.js antes
 * de la primera corrida real — dejamos el mecanismo de espera genérico
 * (polling sobre un buffer expuesto por preload) para no asumir una API
 * concreta que no fue auditada línea por línea en esta sesión.
 */
export async function waitForMilestone(
  page: Page,
  milestoneName: string,
  timeoutMs = 30_000,
): Promise<unknown> {
  return page.waitForFunction(
    ({ name }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const buffer: unknown[] = w.__synapseRunnerMilestoneBuffer ?? [];
      return buffer.find((m: any) => m?.name === name) ?? false;
    },
    { name: milestoneName },
    { timeout: timeoutMs },
  );
}

/**
 * Instala el buffer de milestones que consume waitForMilestone(), enganchado
 * a window.onboarding (o window.electronAPI, según cuál exponga
 * preload_onboarding.js — ambos se intentan). Debe llamarse una vez, apenas
 * la ventana principal está lista.
 */
export async function installMilestoneBuffer(page: Page): Promise<void> {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.__synapseRunnerMilestoneBuffer = w.__synapseRunnerMilestoneBuffer ?? [];

    const bridge = w.onboarding ?? w.electronAPI;
    if (!bridge) {
      console.warn(
        '[synapse-runner] Ni window.onboarding ni window.electronAPI están presentes todavía — ' +
          'installMilestoneBuffer() debe llamarse después de que preload_onboarding.js corra.',
      );
      return;
    }

    // Forma más común para un bridge de contextBridge: onMilestone(cb) o
    // on('milestone:reached', cb). Probamos ambas sin asumir cuál es real.
    if (typeof bridge.onMilestone === 'function') {
      bridge.onMilestone((payload: unknown) => {
        w.__synapseRunnerMilestoneBuffer.push({ name: (payload as any)?.name ?? payload, payload });
      });
    } else if (typeof bridge.on === 'function') {
      bridge.on('milestone:reached', (payload: unknown) => {
        w.__synapseRunnerMilestoneBuffer.push({ name: (payload as any)?.name ?? payload, payload });
      });
    } else {
      console.warn(
        '[synapse-runner] window.onboarding/electronAPI no expone onMilestone() ni on() — ' +
          'confirmar la API real contra preload_onboarding.js antes de confiar en waitForMilestone().',
      );
    }
  });
}
