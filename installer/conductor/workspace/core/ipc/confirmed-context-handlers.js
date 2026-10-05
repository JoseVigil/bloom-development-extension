'use strict';

const fs = require('fs');
const { ipcMain } = require('electron');

function registerConfirmedContextHandlers(execNucleus, nucleusConfigPath, logger = console) {
  ipcMain.handle('core:confirmed-context-read', async () => {
    let selection = { orgSlug: null, projectId: null };
    try {
      const config = JSON.parse(fs.readFileSync(nucleusConfigPath, 'utf8'));
      selection = {
        orgSlug: config.onboarding?.active_org_slug || null,
        projectId: config.onboarding?.active_project_id || null
      };
      if (!selection.orgSlug || !selection.projectId) throw new Error('selection_incomplete');
      const result = await execNucleus(['--json', 'authority', 'context-read', selection.orgSlug, selection.projectId]);
      const evidence = result?.evidence;
      if (evidence?.schema !== 'bloom.confirmed-context/v1' || evidence.selection?.orgSlug !== selection.orgSlug || evidence.selection?.projectId !== selection.projectId) {
        throw new Error('context_response_mismatch');
      }
      return evidence;
    } catch (error) {
      logger.warn('[CONTEXT] read unavailable:', error.message);
      return {
        schema: 'bloom.confirmed-context/v1', evaluatedAt: new Date().toISOString(), selection,
        identityAndMembership: { status: 'not_evaluable', reason: error.message },
        projectBinding: { status: 'not_evaluable', reason: error.message },
        localLocation: { status: 'not_evaluable', reason: 'location_not_evaluated' },
        cognitumCompatibility: { status: 'not_evaluable', reason: 'criterion_not_defined' },
        intelligencePreference: { status: 'not_evaluable', reason: 'preference_not_evaluated' }
      };
    }
  });
}

module.exports = { registerConfirmedContextHandlers };
