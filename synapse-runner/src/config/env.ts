import { config as loadDotenv } from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Carga .env de forma minimalista (sin dependencia de dotenv) y expone la
 * config tipada que consume el resto del Runner.
 */

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(join(process.cwd(), '.env'));
// Referencia a node:process solo para dejar explícito que dependemos del
// process.env real del proceso (evita que un bundler lo tree-shakee).
void loadDotenv;

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`[synapse-runner] Falta variable de entorno requerida: ${name}`);
  }
  return v;
}

function optionalInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const parsed = Number.parseInt(v, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  eventBusWsUrl: required('SYNAPSE_EVENTBUS_WS_URL', 'ws://localhost:4124'),
  debugPanelHttpUrl: required('SYNAPSE_DEBUG_PANEL_HTTP_URL', 'http://localhost:48215'),
  nativeHostPort: optionalInt('SYNAPSE_NATIVE_HOST_PORT', 5678),
  brainCliBin: required('BRAIN_CLI_BIN', 'brain'),
  /**
   * 🔶 Sección 7 punto 2 sin resolver: valor real de ENGINE_RESPONSE_TIMEOUT_MS
   * no extraído todavía de background-companion.js en esta sesión. Este
   * fallback es conservador y CONFIGURABLE — no lo tomes como el valor
   * real hasta confirmarlo (ver scripts/preflight-check.ts, que intenta
   * extraerlo automáticamente del bundle de la extensión activa).
   */
  engineResponseTimeoutMsFallback: optionalInt('ENGINE_RESPONSE_TIMEOUT_MS_FALLBACK', 45_000),
  runnerWatchdogSlackMs: optionalInt('RUNNER_WATCHDOG_SLACK_MS', 5_000),
  conductorExePathOverride: process.env.CONDUCTOR_EXE_PATH || undefined,
  /**
   * Por default (false) el Runner lanza Conductor en modo dev
   * (installer/conductor/workspace/ vía electron . --no-sandbox), no el
   * build empaquetado — confirmado esta sesión que
   * synapse-simulator:inject-milestone (usado por backend_identity_check y,
   * en general, cualquier step simulado) está deshabilitado a propósito
   * cuando app.isPackaged es true. Poner CONDUCTOR_USE_PACKAGED_BUILD=true
   * en .env solo si lo que se quiere probar es específicamente el build
   * empaquetado (CONDUCTOR_EXE_PATH) en sí, no pasos que dependan del
   * simulador.
   */
  useConductorPackagedBuild: process.env.CONDUCTOR_USE_PACKAGED_BUILD === 'true',
  /**
   * Override del directorio installer/conductor/workspace/ para modo dev.
   * Por default se resuelve solo (ruta relativa a este mismo repo) — solo
   * hace falta setear esto si el checkout tiene una estructura distinta.
   */
  conductorWorkspaceRepoPathOverride: process.env.CONDUCTOR_WORKSPACE_REPO_PATH || undefined,
  bloomNucleusBaseDirOverride: process.env.BLOOM_NUCLEUS_BASE_DIR_OVERRIDE || undefined,
  /**
   * Origin del backend Cloudflare Worker (Fase 0 server-side, pasos 00a/00b)
   * corriendo en modo fixture (`AUTHORITY_ALLOW_TEST_FIXTURES=true` en
   * backend/.dev.vars — ver ese archivo). Debe coincidir EXACTO con el
   * `AUTHORITY_HUMAN_ORIGIN` configurado del lado del backend: se usa tal
   * cual como base de las URLs y como header `Origin` en el POST (chequeo
   * de CSRF de administration-route.ts). Ver
   * src/surfaces/phase0-generic-browser.ts.
   */
  backendOrigin: required('SYNAPSE_BACKEND_ORIGIN', 'http://localhost:8787'),
};
