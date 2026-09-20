import { spawnSync } from 'node:child_process';
import net from 'node:net';
import WebSocket from 'ws';
import { env } from '../config/env';

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
