/** Launches a disposable Core tree inside one Windows Job. No security token is restricted. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as net from 'node:net';
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { FunctionalRoot } from './windows-functional-root';
import { inspectFunctionalPorts, makeFunctionalChildEnvironment, verifyFunctionalFixture } from './windows-functional-preflight';

export interface FunctionalLaunch {
  servicePid: number;
  uiPid: number;
  electronPid: number;
  httpPort: number;
  wsPort: number;
  uiPort: number;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('functional_port_allocation_failed')); return; }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

export async function chooseFunctionalPorts(): Promise<{httpPort:number;wsPort:number;uiPort:number}> {
  const occupied = new Set(inspectFunctionalPorts().map(item => item.localPort));
  const ports = new Set<number>();
  while (ports.size < 2) {
    const port = await freePort();
    if (!occupied.has(port) && port !== 5173) ports.add(port);
  }
  // The synthetic nucleus fixture and mock CORS use Core's fixed UI origin.
  if (occupied.has(5173)) throw new Error('functional_ui_port_occupied');
  const [httpPort, wsPort] = [...ports];
  return { httpPort, wsPort, uiPort: 5173 };
}

function buildHelper(fixture: FunctionalRoot): string {
  const helper = path.join(fixture.root, 'bin', 'runner-core-helper.exe');
  const native = path.resolve(__dirname, '../../native/windows-core-isolation');
  if (!fs.statSync(native).isDirectory() || fs.existsSync(helper)) throw new Error('functional_helper_build_target_invalid');
  const go = path.join(process.env.GOROOT || 'C:\\Program Files\\Go', 'bin', 'go.exe');
  execFileSync(go, ['build', '-o', helper, '.'], {
    cwd: native, timeout: 180_000, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GO111MODULE: 'off' },
  });
  if (!fs.statSync(helper).isFile()) throw new Error('functional_helper_build_missing');
  return helper;
}

function diagnosticLogTail(fixture: FunctionalRoot): string {
  const out: string[] = [];
  for (const name of ['service.log','ui.log','workspace.log']) {
    const file = path.join(fixture.root, '.runner-core', name);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
      .filter(line => !/(?:secret|token|password|credential|api[_-]?key)/i.test(line));
    out.push(`${name}:${lines.slice(-12).join(' | ').slice(-1600)}`);
  }
  return out.join('\n');
}

function waitForLaunch(child: ChildProcessWithoutNullStreams, runId: string): Promise<Omit<FunctionalLaunch,'stop'>> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error(`functional_supervisor_timeout:${stderr.slice(-1000)}`)), 90_000);
    const fail = (error: Error): void => { clearTimeout(timeout); reject(error); };
    child.once('error', fail);
    child.once('exit', (code) => fail(new Error(`functional_supervisor_exit:${code}:${stderr.slice(-1000)}`)));
    child.stderr.on('data', chunk => { stderr += String(chunk); if (stderr.length > 4000) stderr = stderr.slice(-4000); });
    child.stdout.on('data', chunk => {
      stdout += String(chunk);
      const newline = stdout.indexOf('\n');
      if (newline < 0) return;
      try {
        const data = JSON.parse(stdout.slice(0, newline)) as Omit<FunctionalLaunch,'stop'> & {runId:string};
        if (data.runId !== runId ||
            ![data.servicePid,data.uiPid,data.electronPid,data.httpPort,data.wsPort,data.uiPort]
              .every(value => Number.isInteger(value) && value > 0)) throw new Error('functional_supervisor_response_invalid');
        clearTimeout(timeout);
        resolve(data);
      } catch (error) { fail(error as Error); }
    });
  });
}

export async function launchFunctionalCore(fixture: FunctionalRoot): Promise<FunctionalLaunch> {
  if (process.platform !== 'win32') throw new Error('functional_launcher_requires_windows');
  verifyFunctionalFixture(fixture);
  const ports = await chooseFunctionalPorts();
  const helper = buildHelper(fixture);
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot) throw new Error('functional_system_root_unavailable');
  const env = makeFunctionalChildEnvironment(fixture, systemRoot);
  Object.assign(env, {
    VITE_RUNNER_CORE_API_BASE_URL: `http://127.0.0.1:${ports.httpPort}/api/v1`,
    VITE_RUNNER_CORE_WS_BASE_URL: `ws://127.0.0.1:${ports.wsPort}`,
  });
  const child = spawn(helper, ['functional-supervisor',fixture.root,String(ports.httpPort),String(ports.wsPort),String(ports.uiPort)], {
    cwd:fixture.root, env, windowsHide:true, stdio:['pipe','pipe','pipe'],
  });
  try {
    const launched = await waitForLaunch(child, fixture.runId);
    if (launched.httpPort !== ports.httpPort || launched.wsPort !== ports.wsPort || launched.uiPort !== ports.uiPort) {
      throw new Error('functional_supervisor_ports_changed');
    }
    const listeners = inspectFunctionalPorts([ports.httpPort,ports.wsPort,ports.uiPort]);
    for (const [port,pid] of [[ports.httpPort,launched.servicePid],[ports.wsPort,launched.servicePid],[ports.uiPort,launched.uiPid]]) {
      const matches = listeners.filter(item => item.localPort === port);
      if (matches.length !== 1 || matches[0].owningProcess !== pid || !['127.0.0.1','[::1]'].includes(matches[0].localAddress)) {
        throw new Error(`functional_port_owner_mismatch:${port}`);
      }
    }
    return { ...launched, stop: () => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error('functional_supervisor_stop_timeout')); }, 15_000);
      child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`functional_supervisor_stop_exit:${code}`)); });
      child.stdin.end();
    }) };
  } catch (error) {
    child.stdin.end();
    child.kill();
    throw new Error(`${(error as Error).message}\n${diagnosticLogTail(fixture)}`);
  }
}
