import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { GenesisBackendRoot } from './windows-genesis-backend-root';
import { inspectFunctionalPorts, withinFunctionalRoot } from './windows-functional-preflight';

export interface Gate2Launch {
  grpcPort: number;
  uiPort: number;
  temporalPid: number;
  watcherPid: number;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('gate2_port_unavailable')); return; }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

export async function chooseGate2Ports(): Promise<{grpcPort:number;uiPort:number}> {
  const occupied = new Set(inspectFunctionalPorts().map(item => item.localPort));
  const ports = new Set<number>();
  while (ports.size < 2) {
    const candidate = await freePort();
    if (![7233,8233,5173].includes(candidate) && !occupied.has(candidate)) ports.add(candidate);
  }
  const [grpcPort,uiPort] = [...ports];
  if (inspectFunctionalPorts([grpcPort,uiPort]).length) throw new Error('gate2_port_became_occupied');
  return { grpcPort,uiPort };
}

export function gate2ChildEnvironment(fixture: GenesisBackendRoot, systemRoot: string, grpcPort: number): Record<string,string> {
  if (process.platform !== 'win32' || !path.win32.isAbsolute(systemRoot) || !Number.isInteger(grpcPort)) {
    throw new Error('gate2_environment_invalid');
  }
  const root = fixture.root;
  const home = path.win32.join(root,'home');
  const drive = path.win32.parse(home).root.slice(0,2);
  const bloom = path.win32.join(home,'AppData','Local','BloomNucleus');
  const result: Record<string,string> = {
    APPDATA:path.win32.join(home,'AppData','Roaming'), LOCALAPPDATA:path.win32.join(home,'AppData','Local'),
    USERPROFILE:home, HOME:home, HOMEDRIVE:drive, HOMEPATH:home.slice(drive.length),
    TEMP:path.win32.join(root,'tmp'), TMP:path.win32.join(root,'tmp'),
    SystemRoot:systemRoot, WINDIR:systemRoot,
    PATH:`${path.win32.join(root,'bin')};${path.win32.join(systemRoot,'System32')}`,
    BLOOM_APPDATA_DIR:bloom, BLOOM_NUCLEUS_BASE_DIR_OVERRIDE:bloom, BLOOM_NUCLEUS_PATH:fixture.workspace,
    RUNNER_CORE_RUN_ID:fixture.runId, RUNNER_CORE_GATE2_ROOT:root,
    RUNNER_CORE_TEMPORAL_ADDRESS:`127.0.0.1:${grpcPort}`,
  };
  for (const key of ['APPDATA','LOCALAPPDATA','USERPROFILE','HOME','TEMP','TMP','BLOOM_APPDATA_DIR',
    'BLOOM_NUCLEUS_BASE_DIR_OVERRIDE','BLOOM_NUCLEUS_PATH','RUNNER_CORE_GATE2_ROOT']) {
    if (!withinFunctionalRoot(result[key],root)) throw new Error(`gate2_environment_escape:${key}`);
  }
  return result;
}

function buildGate2Executables(fixture: GenesisBackendRoot): string {
  const helper = path.join(fixture.root,'bin','gate2-supervisor.exe');
  const watcher = path.join(fixture.root,'bin','gate2-watcher.test.exe');
  const prebuiltHelper = process.env.RUNNER_CORE_GATE2_SUPERVISOR;
  const prebuiltWatcher = process.env.RUNNER_CORE_GATE2_WATCHER;
  if (prebuiltHelper) {
    if (!path.win32.isAbsolute(prebuiltHelper) || !fs.statSync(prebuiltHelper).isFile()) {
      throw new Error('gate2_prebuilt_supervisor_invalid');
    }
    fs.copyFileSync(prebuiltHelper,helper,fs.constants.COPYFILE_EXCL);
  }
  if (prebuiltWatcher) {
    if (!path.win32.isAbsolute(prebuiltWatcher) || !fs.statSync(prebuiltWatcher).isFile()) {
      throw new Error('gate2_prebuilt_watcher_invalid');
    }
    fs.copyFileSync(prebuiltWatcher,watcher,fs.constants.COPYFILE_EXCL);
  }
  const go = path.join(process.env.GOROOT || 'C:\\Program Files\\Go','bin','go.exe');
  // Shared only among disposable Runner fixtures; avoids recompiling the Go
  // dependency graph on every isolated attempt and never uses the user's cache.
  const cache = path.join(path.dirname(fixture.root),'go-cache');
  fs.mkdirSync(cache,{recursive:true});
  if (!fs.existsSync(helper)) execFileSync(go,['build','-o',helper,'.'],{
    cwd:path.resolve(__dirname,'../../native/windows-core-isolation'),timeout:180_000,windowsHide:true,
    stdio:['ignore','pipe','pipe'],env:{...process.env,GO111MODULE:'off',GOCACHE:cache},
  });
  if (!fs.existsSync(watcher)) execFileSync(go,['test','-c','-o',watcher,'./internal/orchestration/acceptance'],{
    cwd:path.resolve(__dirname,'../../../installer/nucleus'),timeout:300_000,windowsHide:true,
    stdio:['ignore','pipe','pipe'],env:{...process.env,GOCACHE:cache},
  });
  if (!fs.statSync(helper).isFile() || !fs.statSync(watcher).isFile()) throw new Error('gate2_executable_missing');
  return helper;
}

function firstResponse(child: ChildProcessWithoutNullStreams, runId: string): Promise<Omit<Gate2Launch,'stop'>> {
  return new Promise((resolve,reject) => {
    let out=''; let err=''; let settled=false;
    const fail=(e:Error) => { if (settled) return; settled=true; clearTimeout(timer); reject(e); };
    const timer=setTimeout(() => fail(new Error(`gate2_supervisor_timeout:${err.slice(-1000)}`)),90000);
    child.once('error',fail);
    child.once('exit',code => fail(new Error(`gate2_supervisor_exit:${code}:${err.slice(-1000)}`)));
    child.stderr.on('data',chunk => {err=(err+String(chunk)).slice(-4000);});
    child.stdout.on('data',chunk => {
      out += String(chunk); const newline=out.indexOf('\n'); if (newline<0 || settled) return;
      try {
        const data=JSON.parse(out.slice(0,newline)) as Omit<Gate2Launch,'stop'> & {runId:string};
        if (data.runId!==runId || ![data.grpcPort,data.uiPort,data.temporalPid].every(n => Number.isInteger(n) && n>0)
          || !Number.isInteger(data.watcherPid) || data.watcherPid<0) throw new Error('gate2_supervisor_response_invalid');
        settled=true; clearTimeout(timer); resolve(data);
      } catch (e) {fail(e as Error);}
    });
  });
}

export async function launchGate2(fixture: GenesisBackendRoot, temporalOnly=false, humanSync=false): Promise<Gate2Launch> {
  if (process.platform !== 'win32') throw new Error('gate2_requires_windows');
  const {grpcPort,uiPort}=await chooseGate2Ports();
  const helper=buildGate2Executables(fixture);
  const systemRoot=process.env.SystemRoot;
  if (!systemRoot) throw new Error('gate2_system_root_missing');
  const env=gate2ChildEnvironment(fixture,systemRoot,grpcPort);
  if (humanSync) {
    const productAppData=process.env.RUNNER_CORE_PRODUCT_APPDATA;
    const nucleusBin=process.env.RUNNER_CORE_NUCLEUS_BIN;
    const grant=process.env.AITAP_VAULT_GRANT_ID;
    if(!productAppData || !nucleusBin || !grant || !path.win32.isAbsolute(productAppData) || !path.win32.isAbsolute(nucleusBin)) {
      throw new Error('gate2_real_vault_contract_missing');
    }
    env.RUNNER_CORE_HUMAN_SYNC='1';
    env.BLOOM_MANDATE_EVENT_URL='http://127.0.0.1:1/internal/mandate-event';
    env.BLOOM_BRAIN_PATH=fixture.brainExe;
    env.AITAP_BIN=fixture.aitapExe;
    env.AITAP_STATE_DIR=fixture.aitapStateDir;
    env.BLOOM_APPDATA_DIR=productAppData;
    env.RUNNER_CORE_PRODUCT_APPDATA=productAppData;
    env.NUCLEUS_BIN=nucleusBin;
    env.AITAP_VAULT_GRANT_ID=grant;
  }
  if (!temporalOnly) fs.rmSync(path.join(fixture.root,'.runner-core','watcher.ready'),{force:true});
  const child=spawn(helper,['gate2-supervisor',fixture.root,String(grpcPort),String(uiPort),temporalOnly?'temporal-only':'watcher'],{
    cwd:fixture.root,env,windowsHide:true,stdio:['pipe','pipe','pipe'],
  });
  try {
    const data=await firstResponse(child,fixture.runId);
    if (data.grpcPort!==grpcPort || data.uiPort!==uiPort || (temporalOnly ? data.watcherPid!==0 : data.watcherPid===0)) {
      throw new Error('gate2_supervisor_identity_invalid');
    }
    const listeners=inspectFunctionalPorts([grpcPort,uiPort]);
    const grpc=listeners.filter(item => item.localPort===grpcPort);
    if (grpc.length!==1 || grpc[0].owningProcess!==data.temporalPid || !['127.0.0.1','[::1]'].includes(grpc[0].localAddress)) {
      throw new Error('gate2_grpc_owner_mismatch');
    }
    if (!temporalOnly) {
      const ready=path.join(fixture.root,'.runner-core','watcher.ready');
      const deadline=Date.now()+30_000;
      while (!fs.existsSync(ready) && Date.now()<deadline) {
        if (child.exitCode!==null) throw new Error(`gate2_watcher_exited:${child.exitCode}`);
        await new Promise(resolve => setTimeout(resolve,100));
      }
      if (!fs.existsSync(ready) || Number(fs.readFileSync(ready,'utf8'))!==data.watcherPid) {
        throw new Error('gate2_watcher_not_ready');
      }
    }
    return {...data,stop:() => new Promise<void>((resolve,reject) => {
      const timer=setTimeout(() => {child.kill();reject(new Error('gate2_stop_timeout'));},20000);
      child.once('exit',code => {clearTimeout(timer);code===0?resolve():reject(new Error(`gate2_stop_exit:${code}`));});
      child.stdin.end();
    })};
  } catch (error) {
    child.stdin.end();
    if (child.exitCode===null) {
      await new Promise<void>(resolve=>{
        const timer=setTimeout(()=>{child.kill();resolve();},10000);
        child.once('exit',()=>{clearTimeout(timer);resolve();});
      });
    }
    const logs=['temporal.log','watcher.log'].map(name => {
      const file=path.join(fixture.root,'.runner-core',name);
      return fs.existsSync(file)?`${name}:${fs.readFileSync(file,'utf8').slice(-1200)}`:'';
    }).join('\n');
    throw new Error(`${(error as Error).message}\n${logs}`);
  }
}
