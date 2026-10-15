import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createGenesisBackendRoot, type GenesisBackendRoot } from '../../src/runner-core/windows-genesis-backend-root';
import { launchGate2, type Gate2Launch } from '../../src/runner-core/windows-genesis-backend-launcher';
import { openGate2Api, type Gate2Api } from '../../src/runner-core/genesis-backend-api';
import { snapshotProductControls, assertProductControlsUnchanged } from '../../src/runner-core/windows-functional-preflight';

test('Human Sync gate: real Gemini classification reaches validate and stops', async () => {
  test.skip(process.platform !== 'win32', 'Windows disposable Job gate');
  test.skip(process.env.RUNNER_CORE_REAL_GEMINI !== '1', 'Explicit real Gemini authorization required');
  test.setTimeout(900_000);
  const controls={files:[path.join(os.homedir(),'AppData','Local','BloomNucleus','config','nucleus.json')],
    directories:['C:\\repos\\eias-repos\\.bloom\\.nucleus-eias-repos\\.mandates']};
  const before=snapshotProductControls(controls);
  let fixture:GenesisBackendRoot|undefined; let launch:Gate2Launch|undefined; let api:Gate2Api|undefined;
  try {
    fixture=createGenesisBackendRoot();
    launch=await launchGate2(fixture,false,true);
    api=await openGate2Api(fixture);
    const response=await api.post({mandateLaunchId:fixture.mandateLaunchId,mandateType:'genesis',
      projectId:fixture.projectId,project:'fixture-project',projectPath:fixture.projectPath,
      name:'Runner Core Human Sync Genesis',source:'runner-core-human-sync'});
    expect(response.statusCode,response.body).toBe(202);
    const mandateId=String(response.json().mandateId);
    const mandateDir=path.join(fixture.mandatesRoot,mandateId);
    const statePath=path.join(mandateDir,'mandate_state.json');
    await expect.poll(()=>{
      if(!fs.existsSync(statePath)) return '';
      return String(JSON.parse(fs.readFileSync(statePath,'utf8')).currentPhase||'');
    },{timeout:300_000,intervals:[500,1000,2000]}).toBe('validate');
    const state=JSON.parse(fs.readFileSync(statePath,'utf8')) as any;
    const proposal=JSON.parse(fs.readFileSync(path.join(mandateDir,'domain_proposal.json'),'utf8')) as any;
    expect(state.phases?.validate?.humanSync?.candidateDomains?.length).toBeGreaterThan(0);
    expect(state.phases?.validate?.humanSync?.confirmedDomainIds).toBeUndefined();
    expect(proposal.classificationDigest).toMatch(/^sha256:/);
    expect(proposal.domains.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(mandateDir,'mandate.json'))).toBe(false);
    expect(fs.existsSync(path.join(mandateDir,'domain_definition.json'))).toBe(false);
  } finally {
    if(api) await api.close();
    if(launch) await launch.stop();
    assertProductControlsUnchanged(before,snapshotProductControls(controls));
    if(fixture) {
      fs.rmSync(fixture.root,{recursive:true,force:true,maxRetries:10,retryDelay:200});
      fs.rmSync(fixture.aitapStateDir,{recursive:true,force:true,maxRetries:10,retryDelay:200});
    }
  }
});
