import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import net from 'node:net';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import WebSocket from 'ws';
import { env } from '../config/env';

interface ObservedProcess {
  executablePath?: string;
  commandLine?: string;
}

interface ObservedPort {
  port: number;
  processes: ObservedProcess[];
}

/** All fields are paths or process metadata. Never include environment secrets. */
export interface R0Evidence {
  target?: 'isolated' | 'installed';
  processInspection?: 'full' | 'ports-only';
  phase: R0Phase;
  runnerBase: string;
  conductorBase: string;
  nucleusBase: string;
  personalBase: string;
  appDataDir: string;
  localAppDataDir: string;
  personalAppDataDir: string;
  workspacePath: string;
  workspaceOrg: string;
  masterProfilePath: string;
  masterExtensionPath: string;
  nucleusExe: string;
  sentinelExe: string;
  brainCliExe: string;
  conductorSource: string;
  expectedConductorSource: string;
  electronExe: string;
  conductorMode?: 'dev' | 'packaged';
  packagedWorkspaceExe?: string;
  packagedAsar?: string;
  backendOrigin: string;
  backendRepo: string;
  expectedD1Path?: string;
  ports: ObservedPort[];
  backendPort: number;
  requiredPorts: number[];
}

export type R0Phase = 'before-00a' | 'after-conductor';

export function canonicalExistingPath(path: string, label: string): string {
  if (!path || !existsSync(path)) throw new Error(`R0: ${label} no existe`);
  return realpathSync.native(resolve(path));
}
const canonical = canonicalExistingPath;

/** Resolve a workspace that onboarding has not created yet, checking its existing ancestor. */
export function canonicalProspectivePath(path: string, label: string): string {
  if (!path || !isAbsolute(path)) throw new Error(`R0: ${label} debe ser absoluto`);
  const absolute = resolve(path);
  if (existsSync(absolute)) return canonical(absolute, label);
  const parent = dirname(absolute);
  if (parent === absolute) throw new Error(`R0: ${label} sin ancestro existente`);
  return join(canonicalProspectivePath(parent, label), basename(absolute));
}

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function inside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..\\`) && !rel.startsWith('../') && !/^([a-z]:)?[\\/]/i.test(rel);
}

function persistPath(command: string): string | undefined {
  const match = command.match(/(?:^|\s)--persist-to(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
  return match?.[1] || match?.[2] || match?.[3];
}

/** Pure validation, also used by the disposable-data unit tests. */
export function validateR0Evidence(e: R0Evidence): string[] {
  const failures: string[] = [];
  const installed = e.target === 'installed';
  const portsOnly = installed && e.processInspection === 'ports-only';
  if (e.processInspection === 'ports-only' && !installed) failures.push('inspección sólo de puertos no permitida para instalación aislada');
  for (const port of e.requiredPorts) {
    const observed = e.ports.find(p => p.port === port);
    if (!observed) failures.push(`puerto ${port} sin inspección`);
    else if (observed.processes.length === 0) failures.push(`puerto ${port} requerido sin proceso escuchando`);
  }
  if (installed) {
    if (!samePath(e.runnerBase, e.personalBase) ||
        !samePath(e.runnerBase, join(e.localAppDataDir, 'BloomNucleus')) ||
        !samePath(e.appDataDir, e.personalAppDataDir)) {
      failures.push('instalación AppData de Runner, LOCALAPPDATA o APPDATA no coinciden con la instalación personal declarada');
    }
  } else {
    if (samePath(e.runnerBase, e.personalBase) || inside(e.runnerBase, e.personalBase) || inside(e.personalBase, e.runnerBase)) {
      failures.push('la instalación de Runner coincide con datos personales o los contiene');
    }
    const isolationRoot = dirname(e.localAppDataDir);
    if (!samePath(e.runnerBase, join(e.localAppDataDir, 'BloomNucleus')) ||
        !inside(e.appDataDir, isolationRoot) || inside(e.appDataDir, e.localAppDataDir) ||
        samePath(e.appDataDir, e.personalAppDataDir) || inside(e.appDataDir, e.personalAppDataDir) ||
        inside(e.personalAppDataDir, e.appDataDir)) {
      failures.push('APPDATA no pertenece al entorno descartable separado de LOCALAPPDATA personal');
    }
  }
  if (!samePath(e.runnerBase, e.conductorBase) || !samePath(e.runnerBase, e.nucleusBase)) {
    failures.push('Runner, Conductor y Nucleus no resuelven la misma instalación');
  }
  if (installed ? !samePath(e.workspacePath, join('C:\\repos', e.workspaceOrg)) :
      (!inside(e.workspacePath, join(e.runnerBase, 'workspaces')) ||
       basename(e.workspacePath) !== e.workspaceOrg || samePath(e.workspacePath, e.personalBase))) {
    failures.push(installed ? 'workspace instalado no coincide con la organización declarada en C:\\repos' : 'workspace fuera de la instalación descartable');
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(e.workspaceOrg) ||
      (!installed && e.workspaceOrg.toLowerCase() === 'eias-repos')) {
    failures.push('organización de prueba personal, ambigua o ausente');
  }
  for (const [name, path] of [
    ['perfil maestro', e.masterProfilePath], ['extensión maestra', e.masterExtensionPath],
    ['binario Nucleus', e.nucleusExe], ['binario Sentinel', e.sentinelExe], ['CLI Brain', e.brainCliExe],
  ] as const) {
    if (!inside(path, e.runnerBase)) failures.push(`${name} fuera de la instalación ${installed ? 'instalada' : 'descartable'}`);
  }
  if (e.conductorMode === 'packaged') {
    if (!e.packagedWorkspaceExe || !samePath(e.packagedWorkspaceExe, join(e.runnerBase, 'bin', 'workspace', 'bloom-workspace.exe')) ||
        !e.packagedAsar || !samePath(e.packagedAsar, join(e.runnerBase, 'bin', 'workspace', 'resources', 'app.asar'))) {
      failures.push('Workspace empaquetado fuera de la instalación seleccionada');
    }
  } else if (!samePath(e.conductorSource, e.expectedConductorSource) || !inside(e.electronExe, e.conductorSource)) {
    failures.push('fuente o binario Electron de Conductor ajeno al checkout previsto');
  }
  const backend = e.ports.find(p => p.port === e.backendPort);
  if (!backend || backend.processes.length === 0) {
    failures.push('Backend sin proceso verificable');
  } else {
    const wrangler = backend.processes.find(p => /wrangler/i.test(p.commandLine || '') &&
      /\bdev\b/.test(p.commandLine || '') && /--local(?:\s|$)/.test(p.commandLine || '') &&
      (p.commandLine || '').toLowerCase().includes(e.backendRepo.toLowerCase()) && persistPath(p.commandLine || ''));
    if (!wrangler) {
      failures.push('Backend sin Wrangler y --persist-to verificables');
    } else {
      const target = persistPath(wrangler.commandLine || '')!;
      let resolvedTarget: string | undefined;
      if (!isAbsolute(target)) failures.push('persistencia D1 debe tener ruta absoluta');
      else {
        try { resolvedTarget = canonical(target, 'persistencia D1'); }
        catch { failures.push('persistencia D1 inexistente o inaccesible'); }
      }
      const expectedD1 = e.expectedD1Path || (installed ? join(e.backendRepo, '.wrangler') : join(e.runnerBase, 'backend-d1'));
      if (resolvedTarget && (!samePath(resolvedTarget, expectedD1) || (!installed && inside(resolvedTarget, e.personalBase)))) {
        failures.push(installed ? 'persistencia D1 fuera del Backend instalado' : 'persistencia D1 compartida o fuera de la instalación descartable');
      }
      if (installed && (!e.expectedD1Path || samePath(expectedD1, join(e.backendRepo, '.wrangler')) ||
          samePath(expectedD1, e.personalBase) || inside(expectedD1, e.personalBase))) {
        failures.push('D1 de prueba ausente o compartida con la instalación habitual');
      }
    }
  }
  for (const observed of e.ports) {
    if (observed.port === e.backendPort) continue;
    if (observed.processes.length === 0) continue; // Puerto opcional y libre.
    if (portsOnly) continue;
    const knownBinary = observed.processes.some(p => p.executablePath &&
      inside(p.executablePath, join(e.runnerBase, 'bin')));
    const isolatedCommand = observed.processes.some(p => p.commandLine &&
      p.commandLine.toLowerCase().includes(e.runnerBase.toLowerCase()) &&
      /(?:nucleus|brain|temporal|bloom-host|bundle\.js)/i.test(p.commandLine));
    if (!knownBinary && !isolatedCommand) {
      failures.push(`puerto ${observed.port} sin proceso atribuible a la instalación ${installed ? 'instalada' : 'descartable'}`);
    }
  }
  return failures;
}

function inspectPorts(ports: number[]): ObservedPort[] {
  if (process.platform !== 'win32') throw new Error('R0: inspección de procesos implementada sólo para Windows');
  const values = ports.join(',');
  const script = `
$ErrorActionPreference = 'Stop'
$answer = @()
foreach ($port in @(${values})) {
  $connections = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq $port })
  $pids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($pids.Count -eq 0) {
    $answer += [pscustomobject]@{ port = $port; processes = @() }
    continue
  }
  if ($pids.Count -ne 1) { throw "port owner ambiguous: $port" }
  $chain = @()
  $current = [int]$pids[0]
  $seen = @{}
  for ($i = 0; $i -lt 16 -and $current -gt 4; $i++) {
    if ($seen.ContainsKey($current)) { throw "process cycle: $port" }
    $seen[$current] = $true
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $current" -ErrorAction Stop
    if (-not $proc -or -not $proc.ExecutablePath -or -not $proc.CommandLine) { throw "process unavailable: $port" }
    $chain += [pscustomobject]@{ executablePath = $proc.ExecutablePath; commandLine = $proc.CommandLine }
    if ($proc.CommandLine -match 'wrangler' -and $proc.CommandLine -match '--persist-to') { break }
    $current = [int]$proc.ParentProcessId
  }
  $answer += [pscustomobject]@{ port = $port; processes = @($chain) }
}

ConvertTo-Json -InputObject @($answer) -Compress -Depth 8
`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { encoding: 'utf8', timeout: 15_000, maxBuffer: 1_000_000 });
  // stderr and command lines may contain private data. Never include them in diagnostics.
  if (result.error || result.status !== 0) throw new Error('R0: no se pudo inspeccionar dueño y ancestros de todos los puertos');
  try { return JSON.parse(result.stdout) as ObservedPort[]; }
  catch { throw new Error('R0: inventario de procesos inválido'); }
}

/** Installed-product runs can check listeners without requiring privileged process ancestry. */
function inspectListeningPorts(ports: number[]): ObservedPort[] {
  if (process.platform !== 'win32') throw new Error('R0: inspección de puertos implementada sólo para Windows');
  const result = spawnSync('netstat.exe', ['-ano', '-p', 'tcp'],
    { encoding: 'utf8', timeout: 15_000, maxBuffer: 1_000_000 });
  if (result.error || result.status !== 0) throw new Error('R0: no se pudo inspeccionar puertos TCP');
  const listening = new Set<number>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+(\S+)\s+\S+\s+LISTENING\s+\d+\s*$/i);
    if (!match) continue;
    const port = Number(match[1].match(/:(\d+)$/)?.[1]);
    if (Number.isInteger(port) && port > 0 && port <= 65535) listening.add(port);
  }
  return ports.map(port => ({ port, processes: listening.has(port) ? [{}] : [] }));
}

/** Synchronous and read-only so resetOnboardingState can call it before writing. */
export function assertR0Isolation(phase: R0Phase = 'before-00a'): R0Evidence | DarwinR0Evidence {
  if (process.platform === 'darwin') return assertDarwinR0Isolation(phase);
  const target = process.env.SYNAPSE_R0_TARGET || 'isolated';
  if (target !== 'isolated' && target !== 'installed') throw new Error('R0: SYNAPSE_R0_TARGET inválido');
  const installedBase = join(require('node:os').homedir(), 'AppData', 'Local', 'BloomNucleus');
  const runnerRaw = process.env.BLOOM_NUCLEUS_BASE_DIR_OVERRIDE || (target === 'installed' ? installedBase : undefined);
  const nucleusRaw = process.env.BLOOM_APPDATA_DIR || (target === 'installed' ? installedBase : undefined);
  const localRaw = process.env.LOCALAPPDATA;
  const appRaw = process.env.APPDATA;
  const workspaceRaw = process.env.SYNAPSE_TEST_WORKSPACE_PATH;
  const org = process.env.SYNAPSE_TEST_WORKSPACE_ORG;
  if (!runnerRaw || !nucleusRaw || !localRaw || !appRaw || !workspaceRaw || !org || !process.env.SYNAPSE_BACKEND_ORIGIN) {
    throw new Error('R0: faltan overrides explícitos de instalación, workspace, organización u origen Backend');
  }
  if (![runnerRaw, nucleusRaw, localRaw, appRaw, workspaceRaw].every(isAbsolute)) {
    throw new Error('R0: todas las rutas de instalación y workspace deben ser absolutas');
  }
  const runnerBase = canonical(runnerRaw, 'instalación Runner');
  const conductorBase = canonical(join(localRaw, 'BloomNucleus'), 'instalación Conductor');
  const nucleusBase = canonical(nucleusRaw, 'instalación Nucleus');
  const localAppDataDir = canonical(localRaw, 'LOCALAPPDATA aislado');
  const appDataDir = canonical(appRaw, 'APPDATA aislado');
  const personalRaw = join(require('node:os').homedir(), 'AppData', 'Local', 'BloomNucleus');
  const personalBase = existsSync(personalRaw) ? canonical(personalRaw, 'instalación personal') : resolve(personalRaw);
  const personalAppRaw = join(require('node:os').homedir(), 'AppData', 'Roaming');
  const personalAppDataDir = existsSync(personalAppRaw) ? canonical(personalAppRaw, 'APPDATA personal') : resolve(personalAppRaw);
  const workspacePath = canonicalProspectivePath(workspaceRaw, target === 'installed' ? 'workspace instalado' : 'workspace descartable');
  const profilesFile = canonical(join(runnerBase, 'config', 'profiles.json'), 'profiles.json aislado');
  const nucleusFile = canonical(join(runnerBase, 'config', 'nucleus.json'), 'nucleus.json aislado');
  if (!inside(profilesFile, runnerBase) || !inside(nucleusFile, runnerBase)) throw new Error('R0: configuración enlazada fuera de la instalación');
  const profiles = JSON.parse(readFileSync(profilesFile, 'utf8')) as {
    profiles?: Array<{ id?: string; master?: boolean; path?: string; extension_path?: string }>;
  };
  const nucleus = JSON.parse(readFileSync(nucleusFile, 'utf8')) as { master_profile?: string };
  const masters = (profiles.profiles || []).filter(p => p.master);
  if (masters.length !== 1 || !nucleus.master_profile || masters[0].id !== nucleus.master_profile ||
      !masters[0].path || !masters[0].extension_path) throw new Error('R0: perfil maestro ausente o ambiguo');
  const origin = new URL(env.backendOrigin);
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname) ||
      !origin.port || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('R0: SYNAPSE_BACKEND_ORIGIN debe ser un origin HTTP loopback explícito');
  }
  const eventPort = new URL(env.eventBusWsUrl).port;
  const debugPort = new URL(env.debugPanelHttpUrl).port;
  if (!eventPort || !debugPort) throw new Error('R0: puertos EventBus/debug ambiguos');
  const backendPort = Number(origin.port);
  const requiredPorts = phase === 'before-00a' ? [backendPort] : [...new Set([backendPort, env.nativeHostPort, 7233])];
  const inspectedPorts = [...new Set([backendPort, env.nativeHostPort, Number(eventPort), Number(debugPort), 7233, 5173])];
  const expectedConductorSource = canonical(resolve(__dirname, '..', '..', '..', 'installer', 'conductor', 'workspace'), 'fuente Conductor');
  if (env.useConductorPackagedBuild && (!env.conductorExePathOverride || !isAbsolute(env.conductorExePathOverride))) {
    throw new Error('R0: CONDUCTOR_EXE_PATH absoluto es obligatorio para Workspace empaquetado');
  }
  const conductorSource = canonical(env.conductorWorkspaceRepoPathOverride || expectedConductorSource, 'fuente Conductor efectiva');
  if (!isAbsolute(env.brainCliBin)) throw new Error('R0: BRAIN_CLI_BIN debe ser una ruta absoluta de la instalación seleccionada');
  const d1Raw = process.env.SYNAPSE_TEST_D1_PERSIST_PATH;
  if (target === 'installed' && (!d1Raw || !isAbsolute(d1Raw))) {
    throw new Error('R0: SYNAPSE_TEST_D1_PERSIST_PATH absoluto es obligatorio para la corrida instalada');
  }
  const evidence: R0Evidence = {
    target, processInspection: target === 'installed' ? 'ports-only' : 'full',
    phase, runnerBase, conductorBase, nucleusBase, personalBase,
    appDataDir, localAppDataDir, personalAppDataDir, workspacePath, workspaceOrg: org,
    masterProfilePath: canonical(masters[0].path, 'perfil maestro'),
    masterExtensionPath: canonical(masters[0].extension_path, 'extensión maestra'),
    nucleusExe: canonical(join(runnerBase, 'bin', 'nucleus', 'nucleus.exe'), 'binario Nucleus'),
    sentinelExe: canonical(join(runnerBase, 'bin', 'sentinel', 'sentinel.exe'), 'binario Sentinel'),
    brainCliExe: canonical(env.brainCliBin, 'binario Brain'),
    conductorSource, expectedConductorSource,
    electronExe: canonical(join(conductorSource, 'node_modules', 'electron', 'dist', 'electron.exe'), 'binario Electron'),
    conductorMode: env.useConductorPackagedBuild ? 'packaged' : 'dev',
    packagedWorkspaceExe: env.useConductorPackagedBuild
      ? canonical(env.conductorExePathOverride!, 'Workspace empaquetado') : undefined,
    packagedAsar: env.useConductorPackagedBuild
      ? canonical(join(dirname(env.conductorExePathOverride!), 'resources', 'app.asar'), 'app.asar empaquetado') : undefined,
    backendOrigin: origin.origin,
    backendRepo: canonical(resolve(__dirname, '..', '..', '..', 'backend'), 'checkout Backend'),
    expectedD1Path: d1Raw ? canonical(d1Raw, 'D1 de prueba') : undefined,
    backendPort,
    requiredPorts,
    ports: (target === 'installed'
      ? inspectListeningPorts(inspectedPorts).map(port => port.port === backendPort ? inspectPorts([backendPort])[0] : port)
      : inspectPorts(inspectedPorts)).map(port => ({
      port: port.port,
      processes: port.processes.map(process => ({
        executablePath: process.executablePath ? canonical(process.executablePath, `ejecutable del puerto ${port.port}`) : undefined,
        commandLine: process.commandLine,
      })),
    })),
  };
  const failures = validateR0Evidence(evidence);
  if (failures.length) throw new Error(`R0: instalación ${target} no verificada: ${failures.join('; ')}`);
  if (target === 'installed') console.warn('R0 installed: Backend y D1 verificados; los otros puertos sólo se comprueban como disponibles');
  return evidence;
}

/**
 * Chequeos de entorno pre-vuelo — fallar rápido y con causa clara ANTES de
 * arrancar Playwright, en vez de que la suite falle 10 minutos después con
 * un timeout genérico en el paso 06-contingencia o en la Capa 3.
 *
 * Esto es deliberadamente parte de la "detección temprana de fallas" que
 * pide la consigna (punto 4) — aplicada al propio arranque del harness.
 */

export interface EnvironmentCheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runEnvironmentChecks(): Promise<EnvironmentCheckResult[]> {
  const results: EnvironmentCheckResult[] = [];

  results.push(await checkTcpPort('native_messaging_host (background.js router)', env.nativeHostPort));
  results.push(await checkEventBusWs());
  results.push(checkBrainCliPresent());

  return results;
}

function checkTcpPort(name: string, port: number): Promise<EnvironmentCheckResult> {
  return new Promise((resolveCheck) => {
    const socket = net.createConnection({ port, host: '127.0.0.1', timeout: 2000 });
    socket.on('connect', () => {
      socket.destroy();
      resolveCheck({ name, ok: true, detail: `puerto ${port} responde` });
    });
    socket.on('error', () => {
      resolveCheck({
        name,
        ok: false,
        detail: `puerto ${port} no responde — el native host / bloom-host.exe probablemente no está corriendo`,
      });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolveCheck({ name, ok: false, detail: `puerto ${port} no respondió en 2s (timeout)` });
    });
  });
}

function checkEventBusWs(): Promise<EnvironmentCheckResult> {
  return new Promise((resolveCheck) => {
    const ws = new WebSocket(env.eventBusWsUrl);
    const timer = setTimeout(() => {
      ws.terminate();
      resolveCheck({
        name: 'EventBus WebSocket (Capa 3)',
        ok: false,
        detail: `${env.eventBusWsUrl} no abrió en 3s — synapse-simulator.html / debug panel probablemente no está levantado`,
      });
    }, 3000);

    ws.once('open', () => {
      clearTimeout(timer);
      ws.close();
      resolveCheck({ name: 'EventBus WebSocket (Capa 3)', ok: true, detail: `${env.eventBusWsUrl} conectado` });
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      resolveCheck({
        name: 'EventBus WebSocket (Capa 3)',
        ok: false,
        detail: `${env.eventBusWsUrl} — ${err.message}`,
      });
    });
  });
}

function checkBrainCliPresent(): EnvironmentCheckResult {
  const probe = spawnSync(env.brainCliBin, ['--version'], { encoding: 'utf-8' });
  if (probe.error || probe.status !== 0) {
    return {
      name: 'brain CLI (Capa 4 / contingencia Submit)',
      ok: false,
      detail: `'${env.brainCliBin} --version' falló — ¿está en PATH? (BRAIN_CLI_BIN en .env)`,
    };
  }
  return {
    name: 'brain CLI (Capa 4 / contingencia Submit)',
    ok: true,
    detail: (probe.stdout || probe.stderr || '').trim() || 'disponible',
  };
}

export function formatEnvironmentChecks(results: EnvironmentCheckResult[]): string {
  return results
    .map((r) => `${r.ok ? '✅' : '⚠️ '} ${r.name}: ${r.detail}`)
    .join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// R0 Darwin — corrida aislada con un usuario macOS de prueba (target
// isolated) o sobre la instalación del usuario actual (target installed).
//
// Conductor (shared/global_paths.js), Nucleus (supervisor/dev_start.go),
// Brain (shared/paths.py) y Metamorph (core/paths.go) resuelven en Darwin
// `<home>/Library/BloomNucleus` sin override propio. El Vault de Nucleus usa
// el llavero del usuario (go-keyring → `security`). El aislamiento entonces
// no se construye con overrides: se exige que el proceso corra como un
// usuario macOS distinto del personal, con HOME igual a su home real, sesión
// gráfica propia (Aqua) y llavero por defecto dentro de ese home, y que cada
// ruta y cada puerto se atribuyan a ese usuario y a esa instalación.
//
// lsof sin privilegios no muestra sockets de otros usuarios: un puerto que
// acepta conexiones sin dueño visible se trata como colisión con otro
// usuario (por ejemplo, servicios personales) y bloquea la corrida.
// Nunca se detiene ni se toca un proceso: sólo se inspecciona.
// ─────────────────────────────────────────────────────────────────────────────

export interface DarwinProcess {
  pid: number;
  uid: number;
  executablePath?: string;
  commandLine?: string;
}

export interface DarwinObservedPort {
  port: number;
  /** El puerto acepta conexiones TCP en loopback (IPv4 o IPv6). */
  reachable: boolean;
  /** Dueño visible y sus ancestros, en ese orden. Vacío si no hay dueño visible. */
  processes: DarwinProcess[];
}

/** Sólo rutas, uids y metadatos de procesos. Nunca valores de entorno ni secretos. */
export interface DarwinR0Evidence {
  platform: 'darwin';
  /** isolated: usuario macOS de prueba. installed: la instalación del usuario actual. */
  target: 'isolated' | 'installed';
  phase: R0Phase;
  uid: number;
  personalUid: number;
  home: string;
  passwdHome: string;
  personalHome: string;
  launchdManager: string;
  defaultKeychain: string;
  runnerBase: string;
  expectedBase: string;
  repoRoot: string;
  workspacePath: string;
  workspaceOrg: string;
  projectSource: string;
  masterProfilePath: string;
  masterExtensionPath: string;
  nucleusExe: string;
  sentinelExe: string;
  brainCliExe: string;
  conductorSource: string;
  expectedConductorSource: string;
  electronExe: string;
  backendOrigin: string;
  backendRepo: string;
  backendPort: number;
  requiredPorts: number[];
  ports: DarwinObservedPort[];
}

function sameOrInside(path: string, root: string): boolean {
  return samePath(path, root) || inside(path, root);
}

/** Validación pura de la evidencia Darwin (cubierta por tests/preflight/isolation-check.test.ts). */
export function validateDarwinR0Evidence(e: DarwinR0Evidence): string[] {
  const f: string[] = [];
  const installed = e.target === 'installed';
  // Usuario, sesión y llavero.
  if (e.uid === 0) f.push('la corrida no puede ejecutarse como root');
  if (!samePath(e.home, e.passwdHome)) f.push(`HOME no coincide con el home real del usuario ${installed ? 'actual' : 'de prueba'}`);
  if (installed) {
    if (e.uid !== e.personalUid || !samePath(e.home, e.personalHome)) f.push('modo installed fuera del usuario y home actuales');
  } else {
    if (e.uid === e.personalUid) f.push('el proceso corre como el usuario personal, no como el usuario de prueba');
    if (sameOrInside(e.home, e.personalHome) || inside(e.personalHome, e.home)) f.push('el home de prueba coincide con el home personal o lo contiene');
  }
  if (e.launchdManager !== 'Aqua') f.push('sin sesión gráfica (Aqua) del usuario que corre');
  if (!inside(e.defaultKeychain, join(e.home, 'Library', 'Keychains'))) f.push('Keychain por defecto fuera del home del usuario que corre');
  // Instalación: Runner, Conductor, Nucleus, Brain y Metamorph convergen en <home>/Library/BloomNucleus.
  if (!samePath(e.runnerBase, e.expectedBase)) f.push('la instalación de Runner no es <home>/Library/BloomNucleus');
  if (!inside(e.runnerBase, e.home)) f.push('la instalación de Runner está fuera del home');
  if (!installed && sameOrInside(e.repoRoot, e.personalHome)) f.push('el checkout está dentro del home personal');
  // Workspace y fixture de proyecto.
  if (installed) {
    if (!samePath(e.workspacePath, join(e.home, 'repos', e.workspaceOrg))) f.push('workspace instalado distinto de <home>/repos/<organización>');
  } else if (!inside(e.workspacePath, join(e.runnerBase, 'workspaces')) || basename(e.workspacePath) !== e.workspaceOrg) {
    f.push('workspace fuera de <instalación>/workspaces/<organización>');
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(e.workspaceOrg) ||
      (!installed && ['elias-repos', 'eias-repos'].includes(e.workspaceOrg.toLowerCase()))) {
    f.push('organización de prueba personal, ambigua o ausente');
  }
  if (sameOrInside(e.projectSource, e.workspacePath) || sameOrInside(e.projectSource, e.runnerBase) ||
      (!installed && (!inside(e.projectSource, e.home) || sameOrInside(e.projectSource, e.personalHome)))) {
    f.push('fuente del proyecto fixture dentro del workspace o la instalación, o fuera del home de prueba');
  }
  // Perfil y binarios.
  for (const [name, path] of [
    ['perfil maestro', e.masterProfilePath], ['extensión maestra', e.masterExtensionPath],
    ['binario Nucleus', e.nucleusExe], ['binario Sentinel', e.sentinelExe], ['CLI Brain', e.brainCliExe],
  ] as const) {
    if (!inside(path, e.runnerBase)) f.push(`${name} fuera de la instalación ${installed ? 'instalada' : 'de prueba'}`);
  }
  if (!samePath(e.conductorSource, e.expectedConductorSource) || !inside(e.conductorSource, e.repoRoot) ||
      !inside(e.electronExe, e.conductorSource)) {
    f.push('fuente o binario Electron de Conductor ajeno al checkout');
  }
  // Puertos: presencia requerida y dueño atribuible.
  for (const port of e.requiredPorts) {
    const observed = e.ports.find(p => p.port === port);
    if (!observed) f.push(`puerto ${port} sin inspección`);
    else if (!observed.reachable) f.push(`puerto ${port} requerido sin proceso escuchando`);
  }
  for (const observed of e.ports) {
    if (!observed.reachable && observed.processes.length === 0) continue; // libre
    if (observed.processes.length === 0) {
      f.push(`colisión: puerto ${observed.port} escuchando con dueño no visible (otro usuario)`);
      continue;
    }
    const owner = observed.processes[0];
    if (owner.uid !== e.uid) {
      f.push(`colisión: puerto ${observed.port} pertenece al uid ${owner.uid}`);
      continue;
    }
    if (observed.port === e.backendPort) continue; // se valida abajo
    const knownBinary = !!owner.executablePath && inside(owner.executablePath, join(e.runnerBase, 'bin'));
    const isolatedCommand = observed.processes.some(p => p.uid === e.uid && !!p.commandLine &&
      (p.commandLine.includes(e.runnerBase) || p.commandLine.includes(e.repoRoot)) &&
      /(?:nucleus|brain|temporal|bloom-host|bundle\.js|vite|electron)/i.test(p.commandLine));
    if (!knownBinary && !isolatedCommand) f.push(`puerto ${observed.port} sin proceso atribuible a la instalación ${installed ? 'instalada' : 'de prueba'}`);
  }
  const expectedD1 = installed ? join(e.backendRepo, '.wrangler') : join(e.runnerBase, 'backend-d1');
  const backend = e.ports.find(p => p.port === e.backendPort);
  if (!backend || backend.processes.length === 0) {
    f.push('Backend sin proceso verificable');
  } else if (backend.processes[0].uid === e.uid) {
    const wrangler = backend.processes.find(p => p.uid === e.uid && /wrangler/i.test(p.commandLine || '') &&
      /\bdev\b/.test(p.commandLine || '') && /--local(?:\s|$)/.test(p.commandLine || '') &&
      (p.commandLine || '').includes(e.backendRepo) && persistPath(p.commandLine || ''));
    if (!wrangler) {
      f.push('Backend sin Wrangler del checkout y --persist-to verificables');
    } else {
      const target = persistPath(wrangler.commandLine || '')!;
      if (!isAbsolute(target)) f.push('persistencia D1 debe tener ruta absoluta');
      else {
        let resolvedTarget: string | undefined;
        try { resolvedTarget = canonical(target, 'persistencia D1'); }
        catch { f.push('persistencia D1 inexistente o inaccesible'); }
        if (resolvedTarget && !samePath(resolvedTarget, expectedD1)) {
          f.push(installed ? 'persistencia D1 distinta de <checkout>/backend/.wrangler' : 'persistencia D1 distinta de <instalación de prueba>/backend-d1');
        }
      }
    }
  }
  return f;
}

/** Ejecuta un comando de inspección de sólo lectura. stderr nunca se reporta: puede tener datos privados. */
function readOnlyCommand(cmd: string, args: string[], allowNoMatch = false): string {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15_000, maxBuffer: 2_000_000 });
  if (r.error) throw new Error(`R0: no se pudo ejecutar ${cmd}`);
  if (r.status !== 0 && !(allowNoMatch && r.status === 1 && !r.stdout.trim())) throw new Error(`R0: ${cmd} falló`);
  return r.stdout;
}

/** Sondeo TCP de sólo conexión (sin enviar datos) en 127.0.0.1 y ::1. */
function darwinPortReachable(port: number): boolean {
  const probe = `
const net=require('node:net');let open=false,left=2;
for(const host of ['127.0.0.1','::1']){const s=net.createConnection({host,port:${port},timeout:1000});
const done=ok=>{if(ok)open=true;s.destroy();if(--left===0)process.exit(open?0:1);};
s.once('connect',()=>done(true));s.once('error',()=>done(false));s.once('timeout',()=>done(false));}`;
  const r = spawnSync(process.execPath, ['-e', probe], { timeout: 5_000 });
  if (r.error || (r.status !== 0 && r.status !== 1)) throw new Error(`R0: no se pudo sondear el puerto ${port}`);
  return r.status === 0;
}

function darwinProcess(pid: number): DarwinProcess & { ppid: number } {
  const meta = readOnlyCommand('/bin/ps', ['-ww', '-o', 'uid=,ppid=', '-p', String(pid)]).trim().split(/\s+/).map(Number);
  if (meta.length !== 2 || !meta.every(Number.isInteger)) throw new Error('R0: proceso no disponible');
  const commandLine = readOnlyCommand('/bin/ps', ['-ww', '-o', 'args=', '-p', String(pid)]).trim() || undefined;
  let executablePath: string | undefined;
  try {
    const txt = readOnlyCommand('/usr/sbin/lsof', ['-nP', '-a', '-p', String(pid), '-d', 'txt', '-Fn'], true);
    const first = txt.split('\n').find(line => line.startsWith('n/'));
    if (first) executablePath = first.slice(1);
  } catch {
    // Proceso de otro usuario: el ejecutable no es visible; la validación lo trata por uid.
  }
  return { pid, uid: meta[0], ppid: meta[1], executablePath, commandLine };
}

/** Dueño de cada puerto y ancestros. lsof sin privilegios sólo ve procesos propios. */
export function inspectPortsDarwin(ports: number[]): DarwinObservedPort[] {
  if (process.platform !== 'darwin') throw new Error('R0: inspección Darwin fuera de macOS');
  return ports.map(port => {
    const out = readOnlyCommand('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], true);
    const pids = [...new Set(out.split('\n').filter(l => l.startsWith('p')).map(l => Number(l.slice(1))))];
    if (pids.some(pid => !Number.isInteger(pid) || pid <= 0)) throw new Error(`R0: inventario de puerto ${port} inválido`);
    if (pids.length > 1) throw new Error(`R0: dueño ambiguo del puerto ${port}`);
    const processes: DarwinProcess[] = [];
    if (pids.length === 1) {
      let current = pids[0];
      const seen = new Set<number>();
      for (let i = 0; i < 16 && current > 1; i++) {
        if (seen.has(current)) throw new Error(`R0: ciclo de procesos en puerto ${port}`);
        seen.add(current);
        const { ppid, ...proc } = darwinProcess(current);
        processes.push(proc);
        current = ppid;
      }
    }
    return { port, reachable: darwinPortReachable(port), processes };
  });
}

function assertDarwinR0Isolation(phase: R0Phase): DarwinR0Evidence {
  const target = process.env.SYNAPSE_R0_TARGET || 'isolated';
  if (target !== 'isolated' && target !== 'installed') throw new Error('R0: SYNAPSE_R0_TARGET inválido');
  if (env.useConductorPackagedBuild) throw new Error('R0: el build empaquetado de Conductor no está habilitado para esta prueba');
  const homeRaw = process.env.HOME;
  // installed: la instalación y el home son los del usuario actual; no hay home personal aparte.
  const runnerRaw = process.env.BLOOM_NUCLEUS_BASE_DIR_OVERRIDE ||
    (target === 'installed' && homeRaw ? join(homeRaw, 'Library', 'BloomNucleus') : undefined);
  const personalRaw = target === 'installed' ? homeRaw : process.env.SYNAPSE_R0_PERSONAL_HOME;
  const workspaceRaw = process.env.SYNAPSE_TEST_WORKSPACE_PATH;
  const projectRaw = process.env.SYNAPSE_TEST_PROJECT_SOURCE;
  const org = process.env.SYNAPSE_TEST_WORKSPACE_ORG;
  if (!runnerRaw || !personalRaw || !workspaceRaw || !projectRaw || !org || !homeRaw || !process.env.SYNAPSE_BACKEND_ORIGIN) {
    throw new Error('R0: faltan overrides explícitos de instalación, home personal, workspace, proyecto, organización u origen Backend');
  }
  if (![runnerRaw, personalRaw, workspaceRaw, projectRaw, homeRaw].every(isAbsolute)) {
    throw new Error('R0: todas las rutas deben ser absolutas');
  }
  const { userInfo } = require('node:os') as typeof import('node:os');
  const uid = process.getuid!();
  const home = canonical(homeRaw, 'HOME de prueba');
  const passwdHome = canonical(userInfo().homedir, 'home real del usuario');
  const personalHome = canonical(personalRaw, 'home personal declarado');
  const personalUid = statSync(personalHome).uid;
  const runnerBase = canonical(runnerRaw, 'instalación Runner');
  const expectedBase = canonical(join(home, 'Library', 'BloomNucleus'), 'instalación del home de prueba');
  const launchdManager = readOnlyCommand('/bin/launchctl', ['managername']).trim();
  const keychainLine = readOnlyCommand('/usr/bin/security', ['default-keychain', '-d', 'user']).trim();
  const keychainRaw = keychainLine.match(/"([^"]+)"/)?.[1];
  if (!keychainRaw) throw new Error('R0: Keychain por defecto no identificable');
  const defaultKeychain = canonical(keychainRaw, 'Keychain por defecto');
  const repoRoot = canonical(resolve(__dirname, '..', '..', '..'), 'checkout');
  const profilesFile = canonical(join(runnerBase, 'config', 'profiles.json'), 'profiles.json aislado');
  const nucleusFile = canonical(join(runnerBase, 'config', 'nucleus.json'), 'nucleus.json aislado');
  if (!inside(profilesFile, runnerBase) || !inside(nucleusFile, runnerBase)) throw new Error('R0: configuración enlazada fuera de la instalación');
  const profiles = JSON.parse(readFileSync(profilesFile, 'utf8')) as {
    profiles?: Array<{ id?: string; master?: boolean; path?: string; extension_path?: string }>;
  };
  const nucleus = JSON.parse(readFileSync(nucleusFile, 'utf8')) as { master_profile?: string };
  const masters = (profiles.profiles || []).filter(p => p.master);
  if (masters.length !== 1 || !nucleus.master_profile || masters[0].id !== nucleus.master_profile ||
      !masters[0].path || !masters[0].extension_path) throw new Error('R0: perfil maestro ausente o ambiguo');
  const origin = new URL(env.backendOrigin);
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname) ||
      !origin.port || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('R0: SYNAPSE_BACKEND_ORIGIN debe ser un origin HTTP loopback explícito');
  }
  const eventPort = new URL(env.eventBusWsUrl).port;
  const debugPort = new URL(env.debugPanelHttpUrl).port;
  if (!eventPort || !debugPort) throw new Error('R0: puertos EventBus/debug ambiguos');
  const backendPort = Number(origin.port);
  const requiredPorts = phase === 'before-00a' ? [backendPort] : [...new Set([backendPort, env.nativeHostPort, 7233])];
  const inspectedPorts = [...new Set([backendPort, env.nativeHostPort, Number(eventPort), Number(debugPort), 7233, 5173])];
  const expectedConductorSource = canonical(join(repoRoot, 'installer', 'conductor', 'workspace'), 'fuente Conductor');
  const conductorSource = canonical(env.conductorWorkspaceRepoPathOverride || expectedConductorSource, 'fuente Conductor efectiva');
  if (!isAbsolute(env.brainCliBin)) throw new Error('R0: BRAIN_CLI_BIN debe ser una ruta absoluta de la instalación de prueba');
  const evidence: DarwinR0Evidence = {
    platform: 'darwin', target, phase, uid, personalUid, home, passwdHome, personalHome, launchdManager, defaultKeychain,
    runnerBase, expectedBase, repoRoot,
    workspacePath: canonical(workspaceRaw, 'workspace de prueba'), workspaceOrg: org,
    projectSource: canonical(projectRaw, 'fuente del proyecto fixture'),
    masterProfilePath: canonical(masters[0].path, 'perfil maestro'),
    masterExtensionPath: canonical(masters[0].extension_path, 'extensión maestra'),
    nucleusExe: canonical(join(runnerBase, 'bin', 'nucleus', 'nucleus'), 'binario Nucleus'),
    sentinelExe: canonical(join(runnerBase, 'bin', 'sentinel', 'sentinel'), 'binario Sentinel'),
    brainCliExe: canonical(env.brainCliBin, 'binario Brain'),
    conductorSource, expectedConductorSource,
    electronExe: canonical(join(conductorSource, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'), 'binario Electron'),
    backendOrigin: origin.origin,
    backendRepo: canonical(join(repoRoot, 'backend'), 'checkout Backend'),
    backendPort, requiredPorts,
    ports: inspectPortsDarwin(inspectedPorts).map(port => ({
      ...port,
      processes: port.processes.map(p => ({
        ...p,
        executablePath: p.executablePath && existsSync(p.executablePath) ? canonical(p.executablePath, `ejecutable del puerto ${port.port}`) : p.executablePath,
      })),
    })),
  };
  const failures = validateDarwinR0Evidence(evidence);
  if (failures.length) throw new Error(`R0: entorno Darwin ${target} no verificado: ${failures.join('; ')}`);
  return evidence;
}

/**
 * Después del lanzamiento del perfil: el puerto CDP debe pertenecer a un
 * Chromium del usuario de prueba cuyo --user-data-dir es el del perfil
 * maestro de la instalación de prueba.
 */
export function assertDarwinProfileProcess(cdpPort: number, userDataDir: string, runnerBase: string): void {
  if (process.platform !== 'darwin') return;
  const dataDir = canonical(userDataDir, 'user-data-dir del perfil');
  const base = canonical(runnerBase, 'instalación Runner');
  if (!inside(dataDir, base)) throw new Error('R0: user-data-dir del perfil fuera de la instalación de prueba');
  const [observed] = inspectPortsDarwin([cdpPort]);
  const owner = observed.processes[0];
  if (!owner) throw new Error(`R0: CDP ${cdpPort} sin dueño visible del usuario de prueba`);
  if (owner.uid !== process.getuid!()) throw new Error(`R0: CDP ${cdpPort} pertenece al uid ${owner.uid}`);
  const own = observed.processes.find(p => p.uid === owner.uid &&
    (p.commandLine || '').includes(`--user-data-dir=${dataDir}`));
  if (!own) throw new Error(`R0: CDP ${cdpPort} no pertenece al Chromium del perfil de prueba`);
}

/** Resumen publicable de la evidencia: sólo rutas, uids y puertos; sin líneas de comando. */
export function summarizeDarwinR0Evidence(e: DarwinR0Evidence): Record<string, unknown> {
  return {
    target: e.target, phase: e.phase, uid: e.uid, personalUid: e.personalUid, home: e.home, launchdManager: e.launchdManager,
    defaultKeychain: e.defaultKeychain, runnerBase: e.runnerBase, repoRoot: e.repoRoot,
    workspacePath: e.workspacePath, projectSource: e.projectSource, masterProfilePath: e.masterProfilePath,
    nucleusExe: e.nucleusExe, sentinelExe: e.sentinelExe, brainCliExe: e.brainCliExe, electronExe: e.electronExe,
    backendOrigin: e.backendOrigin,
    ports: e.ports.map(p => ({ port: p.port, reachable: p.reachable, ownerUid: p.processes[0]?.uid ?? null,
      ownerExecutable: p.processes[0]?.executablePath ?? null })),
  };
}
