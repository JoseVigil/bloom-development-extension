import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import net from 'node:net';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
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
  backendOrigin: string;
  backendRepo: string;
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
      (!inside(e.workspacePath, join(e.runnerBase, 'workspaces')) || samePath(e.workspacePath, e.personalBase))) {
    failures.push(installed ? 'workspace instalado no coincide con la organización declarada en C:\\repos' : 'workspace fuera de la instalación descartable');
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(e.workspaceOrg) || (!installed && e.workspaceOrg.toLowerCase() === 'eias-repos')) {
    failures.push('organización de prueba personal, ambigua o ausente');
  }
  for (const [name, path] of [
    ['perfil maestro', e.masterProfilePath], ['extensión maestra', e.masterExtensionPath],
    ['binario Nucleus', e.nucleusExe], ['binario Sentinel', e.sentinelExe], ['CLI Brain', e.brainCliExe],
  ] as const) {
    if (!inside(path, e.runnerBase)) failures.push(`${name} fuera de la instalación ${installed ? 'instalada' : 'descartable'}`);
  }
  if (!samePath(e.conductorSource, e.expectedConductorSource) || !inside(e.electronExe, e.conductorSource)) {
    failures.push('fuente o binario Electron de Conductor ajeno al checkout previsto');
  }
  const backend = e.ports.find(p => p.port === e.backendPort);
  if (!backend || backend.processes.length === 0) {
    failures.push('Backend sin proceso verificable');
  } else if (!portsOnly) {
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
      const expectedD1 = installed ? join(e.backendRepo, '.wrangler') : join(e.runnerBase, 'backend-d1');
      if (resolvedTarget && (!samePath(resolvedTarget, expectedD1) || (!installed && inside(resolvedTarget, e.personalBase)))) {
        failures.push(installed ? 'persistencia D1 fuera del Backend instalado' : 'persistencia D1 compartida o fuera de la instalación descartable');
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
export function assertR0Isolation(phase: R0Phase = 'before-00a'): R0Evidence {
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
  const workspacePath = canonical(workspaceRaw, target === 'installed' ? 'workspace instalado' : 'workspace descartable');
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
  if (env.useConductorPackagedBuild) throw new Error('R0: el build empaquetado de Conductor no está habilitado para esta prueba');
  const conductorSource = canonical(env.conductorWorkspaceRepoPathOverride || expectedConductorSource, 'fuente Conductor efectiva');
  if (!isAbsolute(env.brainCliBin)) throw new Error('R0: BRAIN_CLI_BIN debe ser una ruta absoluta de la instalación seleccionada');
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
    backendOrigin: origin.origin,
    backendRepo: canonical(resolve(__dirname, '..', '..', '..', 'backend'), 'checkout Backend'),
    backendPort,
    requiredPorts,
    ports: (target === 'installed' ? inspectListeningPorts(inspectedPorts) : inspectPorts(inspectedPorts)).map(port => ({
      port: port.port,
      processes: port.processes.map(process => ({
        executablePath: process.executablePath ? canonical(process.executablePath, `ejecutable del puerto ${port.port}`) : undefined,
        commandLine: process.commandLine,
      })),
    })),
  };
  const failures = validateR0Evidence(evidence);
  if (failures.length) throw new Error(`R0: instalación ${target} no verificada: ${failures.join('; ')}`);
  if (target === 'installed') console.warn('R0 installed: puertos disponibles; no se verifican dueños, ancestros ni ubicación de D1');
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
