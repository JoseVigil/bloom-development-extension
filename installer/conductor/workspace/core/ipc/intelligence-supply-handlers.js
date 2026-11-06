'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { app, ipcMain, shell } = require('electron');
const { randomUUID } = require('crypto');
const { IntentSupplySessionTransport, SCHEMA } = require('./intent-supply-session-transport');

const sessions = new Map();
const observedSenders = new WeakSet();

function safeSessionError(code) {
  const safeCode = typeof code === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(code)
    ? code : 'intent_supply_unavailable';
  return { ok: false, error: { code: safeCode, message: 'No se pudo verificar la selección de suministro.' } };
}

function canonicalContractDigest(value) {
  if (typeof value !== 'string' || !/^(sha256:)?[a-f0-9]{64}$/.test(value)) return null;
  return 'sha256:' + value.replace(/^sha256:/, '');
}

function authorizedConsentURL(value, authorityBaseURL) {
  if (typeof value !== 'string' || typeof authorityBaseURL !== 'string') return null;
  try {
    const url = new URL(value);
    const authority = new URL(authorityBaseURL);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(authority.hostname);
    if (url.origin !== authority.origin ||
        url.pathname !== '/v1/authority/actor/intent-supply-consent' ||
        url.hash || url.username || url.password ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
        Array.from(url.searchParams.keys()).length !== 1 || url.searchParams.getAll('packet').length !== 1 ||
        !url.searchParams.get('packet') || url.searchParams.get('packet').length > 8192) return null;
    return url.href;
  } catch { return null; }
}

function sanitizeSessionData(data, mode, mandateId, digest, requestID) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      data.schema_version !== 'bloom.intent-supply-assignments/v1' ||
      data.operation !== mode || data.request_id !== requestID ||
      data.mandate_id !== mandateId || data.prepared_contract_digest !== digest ||
      !Array.isArray(data.actions) || data.actions.length === 0 || data.actions.length > 128) return null;
  const seenActions = new Set();
  const actions = [];
  for (const row of data.actions) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        typeof row.action_id !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(row.action_id) ||
        seenActions.has(row.action_id) || !Array.isArray(row.requiredCapabilities) ||
        row.requiredCapabilities.length === 0 ||
        row.requiredCapabilities.some(cap => typeof cap !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(cap)) ||
        !Array.isArray(row.errors) || row.errors.some(code =>
          typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/.test(code))) return null;
    seenActions.add(row.action_id);
    const action = { actionId: row.action_id, requiredCapabilities: [...row.requiredCapabilities], errors: [...row.errors],
    };
    if (mode === 'list') {
      const ceiling = row.limit_ceiling;
      if (!ceiling || typeof ceiling !== 'object' || Array.isArray(ceiling) ||
          ['max_inferences', 'max_total_tokens', 'max_output_tokens'].some(key =>
            !Number.isSafeInteger(ceiling[key]) || ceiling[key] <= 0) ||
          (ceiling.max_usd !== undefined &&
            (typeof ceiling.max_usd !== 'string' ||
             !/^(0|[1-9][0-9]*|(?:0|[1-9][0-9]*)\.[0-9]{1,6})$/.test(ceiling.max_usd)))) return null;
      action.limitCeiling = { maxInferences: ceiling.max_inferences, maxTotalTokens: ceiling.max_total_tokens,
        maxOutputTokens: ceiling.max_output_tokens,
        ...(ceiling.max_usd === undefined ? {} : { maxUsd: ceiling.max_usd }) };
      if (!['eligible', 'evidence_missing', 'not_eligible'].includes(row.eligibility) ||
          !Array.isArray(row.destinations) || row.destinations.length > 128) return null;
      const destinations = [];
      const seenDestinations = new Set();
      for (const destination of row.destinations) {
        if (!destination || typeof destination !== 'object' || Array.isArray(destination)) return null;
        const fields = ['backend_id', 'provider', 'model'].map(key => destination[key]);
        if (fields.some(value => typeof value !== 'string' || !/^[a-zA-Z0-9._/-]{1,128}$/.test(value))) return null;
        const key = JSON.stringify(fields);
        if (seenDestinations.has(key)) return null;
        seenDestinations.add(key);
        destinations.push({ backendId: fields[0], provider: fields[1], model: fields[2] });
      }
      if ((row.eligibility === 'eligible' && (destinations.length === 0 || row.errors.length !== 0)) ||
          (row.eligibility !== 'eligible' && (destinations.length !== 0 || row.errors.length === 0))) return null;
      action.eligibility = row.eligibility;
      action.destinations = destinations;
    }
    actions.push(action);
  }
  if (mode === 'list') {
    if (!['eligible', 'not_ready'].includes(data.status) ||
        (data.status === 'eligible' && actions.some(action => action.eligibility !== 'eligible')) ||
        (data.status === 'not_ready' && actions.every(action => action.eligibility === 'eligible')) ||
        actions.some(action => JSON.stringify(action.limitCeiling) !== JSON.stringify(actions[0].limitCeiling))) return null;
    return { mandateId, digest, status: data.status, actions };
  }
  if (!['valid', 'invalid'].includes(data.status) || !Array.isArray(data.errors) ||
      data.errors.some(code => typeof code !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/.test(code))) return null;
  if (data.status === 'valid' &&
      (typeof data.fingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(data.fingerprint) ||
       typeof data.validated_at !== 'string' || typeof data.valid_until !== 'string' ||
       !Number.isFinite(Date.parse(data.validated_at)) || !Number.isFinite(Date.parse(data.valid_until)) ||
       Date.parse(data.valid_until) <= Date.parse(data.validated_at) || data.errors.length !== 0 ||
       actions.some(action => action.errors.length !== 0))) return null;
  return { mandateId, digest, status: data.status, actions, errors: [...data.errors],
    fingerprint: data.status === 'valid' ? data.fingerprint : null,
    validatedAt: data.status === 'valid' ? data.validated_at : null,
    validUntil: data.status === 'valid' ? data.valid_until : null };
}

function sessionSender(event, getCoreWindow, requireAitap = true) {
  const win = getCoreWindow();
  if (!win || win.isDestroyed() || event.sender !== win.webContents ||
      event.senderFrame !== event.sender.mainFrame) return null;
  if (!requireAitap) return event.sender;
  try {
    const url = new URL(event.sender.getURL());
    if (url.pathname !== '/aitap' && url.pathname !== '/aitap/') return null;
  } catch { return null; }
  return event.sender;
}

function closeSession(sender) {
  const current = sessions.get(sender);
  if (current) current.transport.close();
  sessions.delete(sender);
}

function watchSessionSender(sender) {
  if (observedSenders.has(sender)) return;
  observedSenders.add(sender);
  sender.on('destroyed', () => closeSession(sender));
  sender.on('did-start-navigation', (_event, info, _inPlace, isMainFrame) => {
    if ((typeof info === 'object' ? info.isMainFrame : isMainFrame) === true) closeSession(sender);
  });
  sender.on('did-navigate-in-page', (_event, navigation, isMainFrame) => {
    const mainFrame = typeof navigation === 'object' ? navigation.isMainFrame : isMainFrame;
    if (!mainFrame) return;
    try {
      const path = new URL(typeof navigation === 'object' ? navigation.url : navigation).pathname;
      if (path !== '/aitap' && path !== '/aitap/') closeSession(sender);
    } catch { closeSession(sender); }
  });
}

function sanitizeAssignments(assignments) {
  if (!Array.isArray(assignments) || assignments.length === 0 || assignments.length > 128) return null;
  const seen = new Set();
  const result = [];
  for (const item of assignments) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).sort().join(',') !== 'action_id,destination,limits' ||
        typeof item.action_id !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(item.action_id) ||
        seen.has(item.action_id) || !item.destination || typeof item.destination !== 'object' ||
        Array.isArray(item.destination) || Object.keys(item.destination).sort().join(',') !== 'backend_id,model,provider' ||
        ['backend_id', 'provider', 'model'].some(key =>
          typeof item.destination[key] !== 'string' || !/^[a-zA-Z0-9._/-]{1,128}$/.test(item.destination[key])) ||
        !item.limits || typeof item.limits !== 'object' || Array.isArray(item.limits) ||
        Object.keys(item.limits).some(key => !['max_inferences', 'max_output_tokens', 'max_total_tokens', 'max_usd'].includes(key)) ||
        ['max_inferences', 'max_output_tokens', 'max_total_tokens'].some(key =>
          !Number.isSafeInteger(item.limits[key]) || item.limits[key] <= 0) ||
        (item.limits.max_usd !== undefined &&
          (typeof item.limits.max_usd !== 'string' || !/^(0|0\.[0-9]{1,6}|[1-9][0-9]*\.[0-9]{1,6})$/.test(item.limits.max_usd)))) return null;
    seen.add(item.action_id);
    result.push({
      action_id: item.action_id,
      destination: { backend_id: item.destination.backend_id, provider: item.destination.provider, model: item.destination.model },
      limits: { max_inferences: item.limits.max_inferences,
        max_output_tokens: item.limits.max_output_tokens, max_total_tokens: item.limits.max_total_tokens,
        ...(item.limits.max_usd === undefined ? {} : { max_usd: item.limits.max_usd }) }
    });
  }
  return result;
}

async function sessionOperation(current, mode, assignments) {
  const frame = {
    schema: SCHEMA,
    request_id: randomUUID(),
    mandate_id: current.mandateId,
    prepared_contract_digest: current.digest,
    mode
  };
  if (mode === 'validate') frame.assignments = assignments;
  try {
    const response = await current.transport.request(frame);
    if (!response.ok) return safeSessionError(response.error_code);
    const value = sanitizeSessionData(response.data, mode, current.mandateId, current.digest, frame.request_id);
    return value ? { ok: true, value } : safeSessionError('intent_supply_response_unavailable');
  } catch (error) {
    return safeSessionError(error.message);
  }
}

function execJson(exe, args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) { reject(new Error('timeout')); return; }
      let result;
      try {
        result = JSON.parse(stdout.trim());
      } catch (error) {
        reject(new Error(stdout.trim() ? error.message : (stderr.trim() || `exit_${code}`)));
        return;
      }
      if (code !== 0 || result.status === 'error') reject(new Error(result.error?.code || `exit_${code}`));
      else resolve(result);
    });
  });
}

function registerIntelligenceSupplyHandlers(execNucleus, nucleusConfigPath, aitapExe, nucleusExe, getCoreWindow, logger = console,
  runtime = { app, ipcMain, shell, SessionTransport: IntentSupplySessionTransport }) {
  runtime.app.on('before-quit', () => {
    for (const sender of sessions.keys()) closeSession(sender);
  });
  runtime.ipcMain.handle('core:intelligence-supply-read', async () => {
    let selection;
    try {
      const config = JSON.parse(fs.readFileSync(nucleusConfigPath, 'utf8'));
      const onboarding = config.onboarding || {};
      selection = {
        source: 'conductor',
        org_slug: onboarding.active_org_slug || null,
        project_id: onboarding.active_project_id || null
      };
    } catch (error) {
      selection = { source: 'conductor', org_slug: null, project_id: null, error: 'selection_unavailable' };
      logger.warn('[SUPPLY] selection unavailable:', error.message);
    }

    const capture = async (source, operation) => {
      try { return { source, status: 'available', result: await operation() }; }
      catch (error) {
        logger.warn(`[SUPPLY] ${source} read unavailable:`, error.message);
        return { source, status: 'unavailable', error: error.message };
      }
    };

    const nucleus = selection.org_slug
      ? await capture('nucleus', () => execNucleus(['--json', 'authority', 'supply-read', selection.org_slug, selection.project_id || '-']))
      : { source: 'nucleus', status: 'unavailable', error: 'selection_unavailable' };
    const [availability, consumption] = await Promise.all([
      capture('aitap', () => execJson(aitapExe, ['--json', 'local', 'preflight'])),
      capture('aitap', () => execJson(aitapExe, ['--json', 'accounting', 'usage']))
    ]);
    return { read_at: new Date().toISOString(), selection, nucleus, availability, consumption };
  });

  runtime.ipcMain.handle('core:intent-supply-session-list', async (event, selection) => {
    const sender = sessionSender(event, getCoreWindow);
    if (!sender) return safeSessionError('intent_supply_sender_denied');
    const mandateId = selection?.mandateId;
    const digest = canonicalContractDigest(selection?.digest);
    if (typeof mandateId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(mandateId) ||
        !digest) {
      return safeSessionError('intent_supply_invalid_request');
    }
    closeSession(sender);
    watchSessionSender(sender);
    let current;
    try {
      const config = JSON.parse(fs.readFileSync(nucleusConfigPath, 'utf8'));
      const authorityBaseURL = config.authority_base_url;
      if (typeof authorityBaseURL !== 'string' || !authorityBaseURL) {
        return safeSessionError('intent_supply_authority_unavailable');
      }
      current = { mandateId, digest, transport: new runtime.SessionTransport(nucleusExe, {
        aitapBinary: aitapExe,
        onApprovalRequired: async rawURL => {
          const consentURL = authorizedConsentURL(rawURL, authorityBaseURL);
          if (!consentURL) throw new Error('intent_supply_approval_url_denied');
          await runtime.shell.openExternal(consentURL);
        }
      }) };
    } catch { return safeSessionError('intent_supply_unavailable'); }
    sessions.set(sender, current);
    return sessionOperation(current, 'list');
  });

  runtime.ipcMain.handle('core:intent-supply-session-validate', async (event, selection) => {
    const sender = sessionSender(event, getCoreWindow);
    const current = sender && sessions.get(sender);
    if (!current || selection?.mandateId !== current.mandateId ||
        canonicalContractDigest(selection?.digest) !== current.digest) {
      return safeSessionError('intent_supply_session_unavailable');
    }
    const assignments = sanitizeAssignments(selection.assignments);
    if (!assignments) return safeSessionError('intent_supply_invalid_request');
    return sessionOperation(current, 'validate', assignments);
  });

  runtime.ipcMain.handle('core:intent-supply-session-close', async (event, selection) => {
    const sender = sessionSender(event, getCoreWindow, false);
    const current = sender && sessions.get(sender);
    if (current && current.mandateId === selection?.mandateId &&
        current.digest === canonicalContractDigest(selection?.digest)) closeSession(sender);
    return { ok: true };
  });
}

module.exports = { registerIntelligenceSupplyHandlers, sanitizeAssignments, canonicalContractDigest, authorizedConsentURL, sanitizeSessionData };
