import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createGenesisBackendRoot, type GenesisBackendRoot } from '../../src/runner-core/windows-genesis-backend-root';
import { gate2ChildEnvironment, launchGate2, type Gate2Launch } from '../../src/runner-core/windows-genesis-backend-launcher';
import { openGate2Api, type Gate2Api } from '../../src/runner-core/genesis-backend-api';
import { snapshotProductControls, assertProductControlsUnchanged } from '../../src/runner-core/windows-functional-preflight';

function describe(fixture: GenesisBackendRoot, launch: Gate2Launch, mandateId: string): {gate2WorkflowId:string;runId:string;status:string} {
  const exe=path.join(fixture.root,'bin','gate2-watcher.test.exe');
  const environment=gate2ChildEnvironment(fixture,process.env.SystemRoot!,launch.grpcPort);
  let output:string;
  try {
    output=execFileSync(exe,['-test.run','^TestRunnerCoreGate2Describe$','-test.v'],{
      cwd:fixture.root,env:{...environment,RUNNER_CORE_MANDATE_ID:`mandate_build_${mandateId}`},
      windowsHide:true,timeout:20000,encoding:'utf8',stdio:['ignore','pipe','pipe'],
    });
  } catch(error) {
    const child=error as Error & {stdout?:string;stderr?:string;status?:number};
    throw new Error(`gate2_describe_exit:${child.status}:stdout=${String(child.stdout).slice(-600)}:stderr=${String(child.stderr).slice(-600)}`);
  }
  const line=output.split(/\r?\n/).find(value=>value.startsWith('{"gate2WorkflowId"'));
  if (!line) throw new Error(`gate2_temporal_describe_missing:${output.slice(-800)}`);
  return JSON.parse(line) as {gate2WorkflowId:string;runId:string;status:string};
}

test('Gate 2: real Backend creation reaches one durable Temporal workflow without running activities',async()=>{
  test.skip(process.platform!=='win32','Windows disposable Job gate');
  test.setTimeout(600_000);
  const controls={files:[
    path.join(os.homedir(),'AppData','Local','BloomNucleus','config','nucleus.json'),
    'C:\\repos\\eias-repos\\.bloom\\.nucleus-eias-repos\\.ownership.json',
  ],directories:['C:\\repos\\eias-repos\\.bloom\\.nucleus-eias-repos\\.mandates']};
  const before=snapshotProductControls(controls);
  let fixture:GenesisBackendRoot|undefined;
  let launch:Gate2Launch|undefined;
  let api:Gate2Api|undefined;
  let primary:unknown;
  try {
    fixture=createGenesisBackendRoot();
    launch=await launchGate2(fixture);
    api=await openGate2Api(fixture);
    const payload={mandateLaunchId:fixture.mandateLaunchId,mandateType:'genesis',
      projectId:fixture.projectId,project:'fixture-project',projectPath:fixture.projectPath,
      name:'Runner Core Gate 2 synthetic Genesis',source:'runner-core-gate2'};
    const first=await api.post(payload);
    expect(first.statusCode,first.body).toBe(202);
    const mandateId=first.json().mandateId;
    expect(typeof mandateId).toBe('string');
    const directory=path.join(fixture.mandatesRoot,String(mandateId));
    const stateFile=path.join(directory,'mandate_state.json');
    await expect.poll(()=>fs.existsSync(stateFile),{timeout:10000}).toBe(true);
    const state=JSON.parse(fs.readFileSync(stateFile,'utf8')) as Record<string,unknown>;
    expect(state.mandateId).toBe(mandateId);
    expect(state.mandateLaunchId).toBe(fixture.mandateLaunchId);
    expect(state.status).toBe('building');
    expect(fs.readdirSync(fixture.mandatesRoot)).toEqual([mandateId]);
    expect(api.events.filter(item=>item.event==='mandate:build:initiated')).toHaveLength(1);
    expect((api.events[0].data as {mandateId?:string}).mandateId).toBe(mandateId);
    let workflow:{gate2WorkflowId:string;runId:string;status:string}|undefined;
    let lastDescribeError='';
    try {
      await expect.poll(()=>{
        try {workflow=describe(fixture!,launch!,String(mandateId));return workflow.gate2WorkflowId;}
        catch(error) {lastDescribeError=String(error);return null;}
      },{timeout:30000}).toBe(`mandate_build_${mandateId}`);
    } catch(error) {
      const log=path.join(fixture.root,'.runner-core','watcher.log');
      const tail=fs.existsSync(log)?fs.readFileSync(log,'utf8').slice(-3000):'watcher_log_missing';
      throw new Error(`gate2_workflow_not_observed:${lastDescribeError}\nwatcher.log:${tail}`,{cause:error});
    }
    expect(workflow!.runId).toBeTruthy();
    expect(workflow!.status).toBe('Running');
    const replay=await api.post(payload);
    expect(replay.statusCode,replay.body).toBe(202);
    expect(replay.json().mandateId).toBe(mandateId);
    expect(api.events.filter(item=>item.event==='mandate:build:initiated')).toHaveLength(1);
    expect(fs.readdirSync(fixture.mandatesRoot)).toEqual([mandateId]);
    expect(describe(fixture,launch,String(mandateId)).runId).toBe(workflow!.runId);
    await api.close(); api=undefined;
    await launch.stop(); launch=undefined;
    launch=await launchGate2(fixture,true);
    const afterRestart=describe(fixture,launch,String(mandateId));
    expect(afterRestart.runId).toBe(workflow!.runId);
    expect(afterRestart.status).toBe('Running');
    expect(fs.existsSync(path.join(directory,'mandate.json'))).toBe(false);
    const finalState=JSON.parse(fs.readFileSync(stateFile,'utf8')) as Record<string,unknown>;
    expect(finalState.status).toBe('building');
    expect(finalState.currentPhase).toBe('ingest');
    console.log('gate2_verified',JSON.stringify({mandateLaunchId:fixture.mandateLaunchId,mandateId,
      workflowId:afterRestart.gate2WorkflowId,runId:afterRestart.runId,backend202:first.statusCode,
      emittedEvents:1,mandateStates:1,restartRecovered:true}));
  } catch(error) {primary=error;throw error;}
  finally {
    if (api) await api.close();
    if (launch) await launch.stop();
    const after=snapshotProductControls(controls);
    let finalError:unknown;
    try {assertProductControlsUnchanged(before,after);}
    catch(controlError) {finalError=controlError;console.error('gate2_product_control_changed',controlError);}
    if (fixture) {
      let cleanupError:unknown;
      for (let attempt=0;attempt<20;attempt++) {
        try {fs.rmSync(fixture.root,{recursive:true,force:true,maxRetries:2,retryDelay:200});cleanupError=undefined;break;}
        catch(error) {cleanupError=error;await new Promise(resolve=>setTimeout(resolve,500));}
      }
      if (cleanupError) {
        if (!finalError) finalError=cleanupError;
        console.error('gate2_disposable_cleanup_failed',String(cleanupError));
      }
    }
    if (finalError && !primary) throw finalError;
  }
});
