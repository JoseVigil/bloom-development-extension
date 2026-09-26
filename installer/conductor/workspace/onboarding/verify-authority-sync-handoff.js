'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const handlerPath = path.join(__dirname, 'ipc', 'onboarding-handlers.js');
const source = fs.readFileSync(handlerPath, 'utf8');

function position(fragment) {
  const index = source.indexOf(fragment);
  assert.notStrictEqual(index, -1, `No se encontró el fragmento requerido: ${fragment}`);
  return index;
}

const persistOrigin = position('confirmedData.authority_base_url = origin;');
const syncCall = position("await execNucleus(['--json', 'authority', 'sync'], 30_000)");
const reloadAfterSync = source.indexOf(
  "nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));",
  syncCall
);
const tenantGate = position("throw new Error('tenant_id_missing: authority sync no resolvió el tenant de la organización activa')");
const completionWrite = position('completed:     true,');
const workspaceHandoff = position('createWorkspaceWindow(nucleusData.onboarding.workspace_url);');

assert.ok(persistOrigin < syncCall, 'authority_base_url debe persistirse antes del primer sync');
assert.ok(reloadAfterSync > syncCall, 'nucleus.json debe releerse después del sync');
assert.ok(tenantGate > reloadAfterSync, 'tenant_id debe verificarse sobre el estado escrito por Nucleus');
assert.ok(completionWrite > tenantGate, 'completed=true no puede preceder a la validación del tenant');
assert.ok(workspaceHandoff > completionWrite, 'el handoff a Core debe ocurrir después de superar la barrera');

assert.match(source, /activeOrgBeforeSync\.organization_id !== confirmedOrganizationID/);
assert.match(source, /activeOrgAfterSync\.organization_id !== confirmedOrganizationID/);
assert.match(source, /authority_base_url_missing/);

console.log('authority sync onboarding handoff: OK');
