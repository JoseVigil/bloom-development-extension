import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
  // MODO DE LANZAMIENTO (confirmado esta sesión con una corrida real contra
  // el build empaquetado, ya con el bug de extraFiles resuelto): el canal
  // `synapse-simulator:inject-milestone` que usa injectBackendIdentityCheck()
  // —y en general cualquier step que dependa del Synapse Simulator— está
  // deshabilitado a propósito cuando `app.isPackaged === true`
  // ("synapse-simulator not available in production builds", log real de
  // ipc/onboarding-handlers.js). No es un bug: es la guarda de seguridad
  // correcta para no exponer inyección de milestones en un build que un
  // usuario real podría correr. Por diseño, este test SOLO puede correr
  // contra Conductor en modo dev (electron . --no-sandbox — el mismo
  // comando que workspace/package.json expone como "dev:linux" y que ya se
  // confirmó funcionando en esta máquina). El build empaquetado
  // (CONDUCTOR_EXE_PATH) sigue disponible detrás de
  // CONDUCTOR_USE_PACKAGED_BUILD=true en .env para cuando lo que se quiera
  // probar sea específicamente el empaquetado en sí (no pasos que dependan
  // del simulador).
  const launchArgs = env.useConductorPackagedBuild
    ? resolvePackagedLaunchArgs()
    : resolveDevLaunchArgs();

  const app = await electron.launch({
    executablePath: launchArgs.executablePath,
    args: launchArgs.args,
    // Nucleus/Sentinel spawnean su propio Chromium por fuera de Electron
    // (Sección 1: "Brain/Nucleus — spawnea Chromium + perfil") — Conductor
    // en sí es solo la ventana desktop.
  });

  // Diagnóstico (confirmado esta sesión leyendo installer/conductor/shared/logger.js
  // línea 275): cada línea que loguea main_conductor.js —getLogger('onboarding')/
  // getLogger('core')— también pasa por console.log, no solo al archivo de logs.
  // Playwright NO reenvía por default el stdout/stderr del proceso Electron
  // lanzado a la consola del test — sin este forward, los mensajes [BOOT]/
  // [HANDOFF] reales (incluido cualquier fallo silencioso de `nucleus dev-start`
  // dentro de bootServices()) quedan invisibles y un timeout de firstWindow()
  // no dice nada sobre la causa real.
  const proc = app.process();
  proc.stdout?.on('data', (chunk: Buffer) => process.stdout.write(`[conductor] ${chunk}`));
  proc.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[conductor:err] ${chunk}`));

  // Timeout ampliado (confirmado esta sesión leyendo main_conductor.js): la
  // ventana —onboarding o core— recién se crea DESPUÉS de que bootServices()
  // resuelve, y bootServices() (spawnea `nucleus dev-start`) tiene su propio
  // timeout interno de 120s ("Temporal cold start + Brain + Control Plane",
  // comentario del archivo real). El default de Playwright para firstWindow()
  // es 30s — más corto que ese boot en frío, y cortó antes de tiempo en la
  // corrida real de esta sesión (TimeoutError a los 30000ms). Se amplía acá a
  // 150s (120s de bootServices + margen) en vez de en cada call site.
  const mainWindow = await app.firstWindow({ timeout: 150_000 });
  await mainWindow.waitForLoadState('domcontentloaded');

  return {
    app,
    mainWindow,
    async close() {
      await app.close();
    },
  };
}

interface ConductorLaunchArgs {
  executablePath: string;
  args: string[];
}

function resolvePackagedLaunchArgs(): ConductorLaunchArgs {
  return { executablePath: resolveConductorExePath(), args: [] };
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
 * Modo dev — default de este Runner (ver comentario en launchConductor()).
 * Replica exactamente `npm run dev:linux` de
 * installer/conductor/workspace/package.json (`electron . --no-sandbox`),
 * pero apuntando el binario `electron` y el directorio de la app por ruta
 * absoluta, ya que este proceso corre con cwd en synapse-runner/, no en
 * workspace/.
 */
function resolveDevLaunchArgs(): ConductorLaunchArgs {
  const workspaceDir = resolveConductorWorkspaceDir();
  const electronBin = resolveElectronBinary(workspaceDir);

  const args = [workspaceDir];
  // --no-sandbox: mismo flag que dev:linux en package.json. Confirmado esta
  // sesión que alcanza para el electron de node_modules (a diferencia del
  // build empaquetado, donde --no-sandbox NO alcanza y hace falta el
  // chrome-sandbox setuid root — ver installer/metamorph rollout.go,
  // applySandboxSetuid()). Solo en linux/darwin: dev:linux vs dev (mac) del
  // package.json distinguen esto; en Windows no aplica sandbox de este tipo.
  if (process.platform !== 'win32') {
    args.push('--no-sandbox');
  }

  return { executablePath: electronBin, args };
}

function resolveConductorWorkspaceDir(): string {
  if (env.conductorWorkspaceRepoPathOverride) {
    if (!existsSync(env.conductorWorkspaceRepoPathOverride)) {
      throw new Error(
        `[electron-conductor] CONDUCTOR_WORKSPACE_REPO_PATH apunta a un directorio inexistente: ` +
          `${env.conductorWorkspaceRepoPathOverride}`,
      );
    }
    return env.conductorWorkspaceRepoPathOverride;
  }

  // synapse-runner/ e installer/conductor/workspace/ son hermanos dentro
  // del mismo repo (bloom-development-extension). __dirname acá es
  // synapse-runner/src/surfaces — tres niveles arriba es la raíz del repo.
  const candidate = join(__dirname, '..', '..', '..', 'installer', 'conductor', 'workspace');
  if (!existsSync(join(candidate, 'main_conductor.js'))) {
    throw new Error(
      `[electron-conductor] No se encontró installer/conductor/workspace/main_conductor.js relativo a ` +
        `${candidate}. Seteá CONDUCTOR_WORKSPACE_REPO_PATH en .env si tu checkout tiene otra estructura.`,
    );
  }
  return candidate;
}

function resolveElectronBinary(workspaceDir: string): string {
  // Layout real del paquete npm "electron" instalado en workspace/node_modules
  // (confirmado por package.json: "electron": "^28.3.3" en devDependencies).
  const relByPlatform: Record<string, string> = {
    linux: join('node_modules', 'electron', 'dist', 'electron'),
    darwin: join('node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
    win32: join('node_modules', 'electron', 'dist', 'electron.exe'),
  };
  const rel = relByPlatform[process.platform];
  if (!rel) {
    throw new Error(`[electron-conductor] Plataforma no soportada para modo dev: ${process.platform}`);
  }
  const candidate = join(workspaceDir, rel);
  if (!existsSync(candidate)) {
    throw new Error(
      `[electron-conductor] No se encontró el binario de electron en ${candidate}. ` +
        `Corré "npm install" en installer/conductor/workspace/ (mismo paso que dev:linux necesita).`,
    );
  }
  return candidate;
}

/**
 * Espera un milestone expuesto por el bridge IPC (window.onboarding, ver
 * preload_onboarding.js). Contrato CONFIRMADO por lectura directa del
 * código real esta sesión (investigación para
 * `Encargo_Modificacion_Runner_Incorporacion_Step_BackendIdentityCheck_v1_0.md`
 * — ya no es una API sin auditar como decía el comentario anterior de este
 * archivo):
 *
 *   - `preload_onboarding.js::onMilestone(cb)` → `ipcRenderer.on('milestone:reached', (_, data) => cb(data))`.
 *   - `milestone-reactor.js::_emitMilestone(stepId, extra)` envía
 *     `{ stepId, ...extra, _ts }` — el campo identificador es `stepId`, NO
 *     `name`. TODOS los milestones (nucleus_create, vault_init,
 *     github_app_auth, google_auth, ai_provider_setup, project_select,
 *     mandate_genesis, backend_identity_check, y el especial
 *     '__onboarding_complete__') viajan por el MISMO canal
 *     `'milestone:reached'` — no hay un canal por milestone.
 *
 * `milestoneStepId` acá es literalmente el `stepId` real del SSOT de
 * Conductor (`onboarding_steps.json` / `milestone-registry.js::FALLBACK_STEPS`),
 * no un nombre de canal IPC.
 *
 * ⚠️ Los usos existentes de esta función en `onboarding-flow.spec.ts` para
 * los pasos `01_launch` (`'onboarding:launch-discovery'`) y
 * `03_oauth_github` (`'milestone:reached'`) predatan esta confirmación y
 * NO son stepIds reales del SSOT (`'onboarding:launch-discovery'` es un
 * canal IPC distinto — ver `launchDiscovery` en preload_onboarding.js,
 * comentado ahí como "Paso 0 (legacy)" — y `'milestone:reached'` es el
 * nombre del canal, no de un step). Quedan señalados pero SIN TOCAR en
 * esta modificación: el encargo que motivó esta sesión es incorporar
 * `backend_identity_check`, no auditar/corregir el resto del mapeo de
 * milestones de los pasos 01-11, que ya estaba marcado como sin confirmar
 * antes de este cambio y sigue así — no inventar el stepId real de esos
 * dos sin la misma verificación directa contra el código que se hizo acá
 * para backend_identity_check.
 */
export async function waitForMilestone(
  page: Page,
  milestoneStepId: string,
  timeoutMs = 30_000,
): Promise<unknown> {
  return page.waitForFunction(
    ({ stepId }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const buffer: unknown[] = w.__synapseRunnerMilestoneBuffer ?? [];
      return buffer.find((m: any) => m?.stepId === stepId) ?? false;
    },
    { stepId: milestoneStepId },
    { timeout: timeoutMs },
  );
}

/**
 * Instala el buffer de milestones que consume waitForMilestone(), enganchado
 * a window.onboarding.onMilestone() (confirmado — ver el comentario de
 * waitForMilestone() arriba; window.electronAPI no existe en el bridge
 * real, se deja el intento como red de seguridad nada más). Debe llamarse
 * una vez, apenas la ventana principal está lista.
 */
export async function installMilestoneBuffer(page: Page): Promise<void> {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.__synapseRunnerMilestoneBuffer = w.__synapseRunnerMilestoneBuffer ?? [];

    const bridge = w.onboarding ?? w.electronAPI;
    if (!bridge) {
      console.warn(
        '[synapse-runner] window.onboarding no está presente todavía — ' +
          'installMilestoneBuffer() debe llamarse después de que preload_onboarding.js corra.',
      );
      return;
    }

    // window.onboarding.onMilestone(cb) es la API real confirmada
    // (preload_onboarding.js). El fallback a bridge.on() se deja solo por
    // si algún día el bridge expone otra forma — no está confirmado que
    // exista.
    if (typeof bridge.onMilestone === 'function') {
      // payload YA es { stepId, ...extra, _ts } — preload_onboarding.js lo
      // pasa tal cual, sin envolverlo.
      bridge.onMilestone((payload: unknown) => {
        w.__synapseRunnerMilestoneBuffer.push({ stepId: (payload as any)?.stepId, payload });
      });
    } else if (typeof bridge.on === 'function') {
      bridge.on('milestone:reached', (payload: unknown) => {
        w.__synapseRunnerMilestoneBuffer.push({ stepId: (payload as any)?.stepId, payload });
      });
    } else {
      console.warn(
        '[synapse-runner] window.onboarding no expone onMilestone() ni on() — ' +
          'confirmar la API real contra preload_onboarding.js antes de confiar en waitForMilestone().',
      );
    }
  });
}
