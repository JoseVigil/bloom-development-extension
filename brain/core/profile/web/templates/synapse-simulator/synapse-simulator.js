'use strict';

// ============================================================================
// ProtocolReader
// Discovers PROTOCOL_MANIFEST objects injected by each protocol script.
// ============================================================================
const ProtocolReader = {
  manifests: [],

  /**
   * Scans window for all *_PROTOCOL_MANIFEST globals and registers them.
   * Called once on DOMContentLoaded, then again after a short delay
   * to catch async-loaded scripts.
   */
  discover() {
    const candidates = [
      'DISCOVERY_PROTOCOL_MANIFEST',
      'LANDING_PROTOCOL_MANIFEST',
      'SYNAPSE_SIMULATOR_PROTOCOL_MANIFEST',
    ];

    this.manifests = [];

    for (const key of candidates) {
      const manifest = (typeof self !== 'undefined' && self[key])
                    || (typeof window !== 'undefined' && window[key]);
      if (manifest) {
        this.manifests.push({ key, manifest });
        console.log(`[ProtocolReader] ✓ Found: ${key} (${manifest.messages?.length || 0} messages)`);
      }
    }

    console.log(`[ProtocolReader] Loaded ${this.manifests.length} protocol(s).`);
    return this.manifests;
  },

  /**
   * Carga los tres schemas JSON independientes vía chrome.runtime.getURL()
   * y los convierte en manifests compatibles con el array this.manifests.
   * Retorna una Promise que resuelve cuando todos terminaron (con allSettled,
   * para que un schema faltante no bloquee los otros dos).
   */
  async discoverFromJSON() {
    const SCHEMA_FILES = [
      { file: 'protocols/discovery.schema.json', key: 'DISCOVERY_PROTOCOL_MANIFEST' },
      { file: 'protocols/landing.schema.json',   key: 'LANDING_PROTOCOL_MANIFEST'   },
      { file: 'protocols/synapse-simulator.schema.json',   key: 'SYNAPSE_SIMULATOR_PROTOCOL_MANIFEST'   },
    ];

    // Solo disponible dentro de la extensión; en dev standalone esta función
    // simplemente no carga nada (los legacy globals ya cubrieron el caso).
    if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
      console.log('[ProtocolReader] chrome.runtime.getURL no disponible — skipping JSON schemas');
      return;
    }

    const results = await Promise.allSettled(
      SCHEMA_FILES.map(async ({ file, key }) => {
        const url = chrome.runtime.getURL(file);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${file}`);
        const schema = await res.json();

        // Evitar duplicados: si el global legacy ya cargó este manifest, omitir.
        const alreadyLoaded = this.manifests.some(m => m.key === key);
        if (alreadyLoaded) {
          console.log(`[ProtocolReader] ↷ JSON schema skipped (legacy global present): ${key}`);
          return;
        }

        this.manifests.push({ key, manifest: schema });
        console.log(`[ProtocolReader] ✓ JSON schema loaded: ${key} (${schema.messages?.length || 0} messages)`);
      })
    );

    // Loguear failures sin explotar
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        console.warn(`[ProtocolReader] ✗ Failed to load ${SCHEMA_FILES[i].file}:`, result.reason);
      }
    }

    console.log(`[ProtocolReader] After JSON discovery: ${this.manifests.length} protocol(s) total.`);
  },

  /**
   * Renders the protocol list into #protocol-list.
   * Each message is a clickable item that populates the Simulator.
   */
  render() {
    const container = document.getElementById('protocol-list');
    if (!container) return;

    container.innerHTML = '';

    if (this.manifests.length === 0) {
      container.innerHTML = '<div style="padding: 16px 14px; color: var(--text-muted); font-size: 11px;">No protocol manifests found.</div>';
      return;
    }

    for (const { manifest } of this.manifests) {
      const section = document.createElement('div');
      section.className = 'protocol-section';

      const headerEl = document.createElement('div');
      headerEl.className = 'protocol-section-header';
      headerEl.innerHTML = `
        <svg class="chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
          <polyline points="2,4 6,8 10,4"/>
        </svg>
        ${manifest.protocol?.toUpperCase() || 'UNKNOWN'}
        <span style="margin-left:auto; font-weight:400; color:var(--text-muted); font-size:10px; text-transform:none; letter-spacing:0;">
          ${manifest.messages?.length || 0} msgs
        </span>
      `;

      const body = document.createElement('div');
      body.className = 'protocol-section-body';

      headerEl.addEventListener('click', () => {
        headerEl.classList.toggle('collapsed');
        body.classList.toggle('collapsed');
      });

      for (const msg of (manifest.messages || [])) {
        const item = document.createElement('div');
        item.className = 'message-item';
        item.dataset.msgId = msg.id;
        item.dataset.protocol = manifest.protocol;
        item.innerHTML = `
          <span class="msg-type-badge ${msg.type}">${msg.type}</span>
          <div>
            <div class="msg-label">${msg.id}</div>
            <div class="msg-desc">${msg.description || ''}</div>
          </div>
        `;
        item.addEventListener('click', () => {
          document.querySelectorAll('.message-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          Simulator.load(msg);
        });
        body.appendChild(item);
      }

      section.appendChild(headerEl);
      section.appendChild(body);
      container.appendChild(section);
    }

    // Update config protocols list
    const cfgProtocols = document.getElementById('cfg-protocols-list');
    if (cfgProtocols) {
      cfgProtocols.innerHTML = this.manifests.map(({ manifest }) => `
        <div style="display:flex; justify-content:space-between; padding: 3px 0; border-bottom: 1px solid var(--border-muted);">
          <span style="font-family: var(--font-mono); font-size:11px; color:var(--text-secondary);">${manifest.protocol}</span>
          <span style="font-size:10px; color:var(--success);">v${manifest.version} · ${manifest.messages?.length || 0} msgs</span>
        </div>
      `).join('') || '<span style="color: var(--text-muted); font-size: 11px;">None</span>';
    }
  }
};

// ============================================================================
// Simulator
// Builds the parameter form and sends messages via chrome.runtime.
// ============================================================================
const Simulator = {
  currentMessage: null,
  currentValues: {},

  load(msg) {
    this.currentMessage = msg;
    this.currentValues = {};

    // Pre-fill defaults
    for (const param of (msg.parameters || [])) {
      if (param.default !== undefined) {
        this.currentValues[param.variable] = param.default;
      }
    }

    this._renderHeader(msg);
    this._renderParams(msg);
    this._updatePreview();

    // Start each newly selected message with header description and payload
    // preview collapsed, so the actual params form (the important part) is
    // what's visible without scrolling.
    document.getElementById('simulate-header').classList.remove('expanded');
    document.getElementById('header-desc-toggle').textContent = 'Show details';
    document.getElementById('payload-preview').classList.remove('expanded');
    document.getElementById('payload-preview-toggle').textContent = 'Show';

    document.getElementById('simulate-empty').classList.add('hidden');
    document.getElementById('simulate-form').classList.add('active');
    document.getElementById('send-status').textContent = '';
    document.getElementById('send-status').className = '';
  },

  _renderHeader(msg) {
    document.getElementById('sim-msg-id').textContent = msg.id;
    document.getElementById('sim-msg-desc').textContent = msg.description || '';

    const typeChip = document.getElementById('sim-type-chip');
    typeChip.textContent = msg.type;
    typeChip.className = `meta-chip ${msg.type}`;

    document.getElementById('sim-direction-chip').textContent = msg.direction || '—';
    document.getElementById('sim-channel-chip').textContent = msg.channel || '—';
  },

  _renderParams(msg) {
    const container = document.getElementById('sim-params');
    container.innerHTML = '';

    if (!msg.parameters || msg.parameters.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 12px;">No parameters.</p>';
      return;
    }

    for (const param of msg.parameters) {
      const group = document.createElement('div');
      group.className = 'field-group';

      const label = document.createElement('div');
      label.className = 'field-label';

      if (param.type === 'auto' && param.live_resolver) {
        // 🔧 live_resolver: params cuyo valor real vive en OTRO contexto de
        // ejecución (ej: la página discovery/index.html, no la del SynapseSimulator).
        // window.<Foo> traversal (_resolveAutoParam) es estructuralmente
        // incapaz de verlos — SynapseSimulator y Discovery son documentos distintos,
        // no comparten window aunque estén en la misma extensión. Para estos
        // casos no mostramos un valor auto-resuelto (siempre iba a ser
        // "(not available)" o, peor, el string literal "undefined" colándose
        // en el payload como pasó con GOOGLE_LOGIN_DETECTED). En su lugar:
        // botón "Detect" que le pregunta a background.js su propio estado
        // interno (fuente de verdad real y compartida) + input editable como
        // fallback manual si la detección no devuelve nada.
        label.innerHTML = `
          ${param.name}
          <span class="field-type">${param.type}</span>
          <span class="field-auto" style="background: rgba(210,153,34,0.12); color: var(--warning);">LIVE</span>
        `;

        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:6px; align-items:center;';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'field-input';
        input.placeholder = '(not detected yet)';
        input.value = '';
        input.addEventListener('input', () => {
          this.currentValues[param.variable] = input.value;
          this._updatePreview();
        });

        const detectBtn = document.createElement('button');
        detectBtn.type = 'button';
        detectBtn.className = 'btn btn-secondary';
        detectBtn.style.cssText = 'flex-shrink:0; white-space:nowrap;';
        detectBtn.textContent = '🔍 Detect';

        const hint = document.createElement('div');
        hint.className = 'field-auto-source';
        hint.style.marginTop = '4px';
        hint.textContent = param.live_resolver_hint || '';

        detectBtn.addEventListener('click', async () => {
          detectBtn.disabled = true;
          detectBtn.textContent = '…';
          try {
            const result = await this._resolveLiveParam(param.live_resolver);
            if (result.ok) {
              input.value = result.value;
              this.currentValues[param.variable] = result.value;
              this._updatePreview();
              SynapseSimulator.notify(`Detected ${param.name}: ${result.value}`, 'success');
            } else {
              SynapseSimulator.notify(result.message || 'Nothing detected — check hint below', 'error');
            }
          } catch (e) {
            SynapseSimulator.notify(e.message, 'error');
          } finally {
            detectBtn.disabled = false;
            detectBtn.textContent = '🔍 Detect';
          }
        });

        row.appendChild(input);
        row.appendChild(detectBtn);

        this.currentValues[param.variable] = '';

        group.appendChild(label);
        group.appendChild(row);
        if (hint.textContent) group.appendChild(hint);

      } else if (param.type === 'auto') {
        label.innerHTML = `
          ${param.name}
          <span class="field-type">${param.type}</span>
          <span class="field-auto">AUTO</span>
        `;

        const autoVal = document.createElement('div');
        autoVal.className = 'field-auto-value';
        autoVal.innerHTML = `
          <span id="auto-val-${param.variable.replace('$', '')}">resolving…</span>
          <span class="field-auto-source">${param.source || ''}</span>
        `;

        // Resolve auto value from config
        const resolved = this._resolveAutoParam(param);
        autoVal.querySelector('span').textContent = resolved || '(not available)';
        this.currentValues[param.variable] = resolved;

        group.appendChild(label);
        group.appendChild(autoVal);

      } else if (param.type === 'enum') {
        label.innerHTML = `${param.name} <span class="field-type">enum</span>`;

        const select = document.createElement('select');
        select.className = 'field-select';
        for (const opt of (param.options || [])) {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          select.appendChild(o);
        }

        if (param.default) select.value = param.default;
        this.currentValues[param.variable] = select.value;

        select.addEventListener('change', () => {
          this.currentValues[param.variable] = select.value;
          this._updatePreview();
        });

        group.appendChild(label);
        group.appendChild(select);

      } else {
        // string or unknown
        label.innerHTML = `${param.name} <span class="field-type">${param.type || 'string'}</span>`;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'field-input';
        input.value = param.default || '';
        input.placeholder = param.variable;

        this.currentValues[param.variable] = input.value;

        input.addEventListener('input', () => {
          this.currentValues[param.variable] = input.value;
          this._updatePreview();
        });

        group.appendChild(label);
        group.appendChild(input);
      }

      container.appendChild(group);
    }
  },

  _resolveAutoParam(param) {
    if (!param.source) return null;

    // 🔧 FIX: source "Date.now()" venía mandando timestamp:"undefined" en
    // TODOS los eventos (confirmado en telemetría en github_app_authorized
    // y vault_initialized, no solo en el caso de Google). El traversal de
    // abajo hacía window['Date']['now()'] — busca una PROPIEDAD literal
    // llamada "now()", no invoca el método now(). Caso especial explícito
    // en vez de un parser de expresiones genérico, que sería overkill acá.
    if (param.source === 'Date.now()') {
      return String(Date.now());
    }

    try {
      const parts = param.source.split('.');
      let obj = window;
      for (const part of parts) {
        obj = obj?.[part];
      }
      return typeof obj === 'string' ? obj : JSON.stringify(obj);
    } catch (e) {
      return null;
    }
  },

  /**
   * _resolveLiveParam(resolverName)
   *
   * Contraparte de _resolveAutoParam para valores que NO viven en el window
   * del SynapseSimulator. Cada resolver le pregunta a background.js (que sí tiene
   * visibilidad real, porque el estado vive ahí) en vez de intentar leer
   * un global de otro documento. Devuelve { ok: boolean, value?, message? }.
   */
  async _resolveLiveParam(resolverName) {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return { ok: false, message: 'chrome.runtime not available' };
    }

    if (resolverName === 'google_watched_tab') {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ command: 'SYNAPSE_SIMULATOR_GET_WATCHED_GOOGLE_TAB' }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            resolve({ ok: false, message: err.message });
            return;
          }
          const tabIds = response?.tabIds || [];
          if (tabIds.length === 0) {
            resolve({
              ok: false,
              message: 'No hay ninguna tab en observación. Abrí el flujo real primero: click "Open Google" en Discovery.'
            });
          } else if (tabIds.length === 1) {
            resolve({ ok: true, value: String(tabIds[0]) });
          } else {
            // Más de un watcher activo — devolvemos el más reciente
            // (último insertado en el Map, orden de inserción) y avisamos.
            const chosen = tabIds[tabIds.length - 1];
            Logger.log('INFO', `Múltiples tabs en watch (${tabIds.join(', ')}) — usando la más reciente: ${chosen}`);
            resolve({ ok: true, value: String(chosen) });
          }
        });
      });
    }

    return { ok: false, message: `Unknown live_resolver: ${resolverName}` };
  },

  _buildPayload() {
    if (!this.currentMessage) return {};

    let template = JSON.stringify(this.currentMessage.payload_template || {});

    for (const [variable, value] of Object.entries(this.currentValues)) {
      const safeVal = typeof value === 'string' ? value : JSON.stringify(value);
      // Replace quoted variables (in JSON context): "$VAR" → "value"
      template = template.split(`"${variable}"`).join(`"${safeVal}"`);
      // Replace unquoted references
      template = template.split(variable).join(safeVal);
    }

    try {
      return JSON.parse(template);
    } catch (e) {
      return { _raw: template, _parseError: e.message };
    }
  },

  _updatePreview() {
    const payload = this._buildPayload();
    const el = document.getElementById('payload-preview-code');
    if (el) {
      el.textContent = JSON.stringify(payload, null, 2);
    }
  },

  send() {
    const msg = this.currentMessage;
    if (!msg) {
      SynapseSimulator.notify('Seleccioná un mensaje primero', 'error');
      return;
    }

    const payload = this._buildPayload();
    const statusEl = document.getElementById('send-status');

    // Determine channel
    const channel = msg.channel || 'runtime';

    if (channel === 'runtime') {
      // Send via chrome.runtime.sendMessage to background
      const extensionId = ConfigReader.synapseSimulatorConfig?.extensionId;

      if (typeof chrome === 'undefined' || !chrome.runtime) {
        Logger.log('ERR', `chrome.runtime not available`);
        statusEl.textContent = '✗ chrome.runtime unavailable';
        statusEl.className = 'error';
        SynapseSimulator.notify('chrome.runtime not available — are you inside the extension?', 'error');
        return;
      }

      const target = extensionId || chrome.runtime.id;
      Logger.log('SEND', `→ ${msg.id} [${channel}] target=${target} ${JSON.stringify(payload)}`);

      // 🔧 FIX: msg.type distingue 'command' (espera sendResponse) de 'event'
      // (fire-and-forget, como VAULT_INITIALIZED). background.js emite los
      // eventos reales con .catch(() => {}) y sin callback — ningún listener
      // les llama sendResponse() a propósito. Si igual les pedimos callback
      // acá, Chrome cierra el puerto sin respuesta → "message port closed
      // before a response was received", aunque en producción ese mismo
      // mensaje funcione perfecto.
      const isEvent = msg.type === 'event';

      try {
        // No pasar extensionId explícito: desde una página interna de la extensión,
        // sendMessage sin target ya enruta al propio background.
        // Con target explícito Chrome trata el mensaje como cross-extension y lo rechaza
        // a menos que manifest.json declare externally_connectable.
        if (isEvent) {
          // Sin callback, chrome.runtime.sendMessage devuelve una Promise (MV3).
          // Si no se atrapa el rechazo, un fallo silencioso (p.ej. "Extension
          // context invalidated" tras recargar la extensión) queda invisible:
          // el try/catch de más abajo NO cubre esto porque sendMessage retorna
          // de inmediato, antes de que la Promise se resuelva o rechace.
          chrome.runtime.sendMessage(payload).catch((err) => {
            Logger.log('ERR', `sendMessage failed: ${err.message}`);
            statusEl.textContent = '✗ Send failed';
            statusEl.className = 'error';
            SynapseSimulator.notify(err.message, 'error');
          });
          Logger.log('ACK', 'fire-and-forget (event, sin respuesta esperada)');
          statusEl.textContent = '✓ Sent';
          statusEl.className = 'ok';
          SynapseSimulator.notify(`${msg.id} sent`, 'success');
        } else {
          chrome.runtime.sendMessage(payload, (response) => {
            const err = chrome.runtime.lastError; // consumir sincrónicamente
            if (err) {
              Logger.log('ERR', err.message);
              statusEl.textContent = '✗ Error';
              statusEl.className = 'error';
              SynapseSimulator.notify(err.message, 'error');
            } else {
              const responseStr = response !== undefined ? JSON.stringify(response) : 'null (fire-and-forget)';
              Logger.log('ACK', responseStr);
              statusEl.textContent = '✓ Sent';
              statusEl.className = 'ok';
              SynapseSimulator.notify(`${msg.id} sent`, 'success');
            }
          });
        }
      } catch (e) {
        Logger.log('ERR', e.message);
        statusEl.textContent = '✗ Exception';
        statusEl.className = 'error';
        SynapseSimulator.notify(e.message, 'error');
      }

    } else {
      Logger.log('ERR', `Unknown channel: ${channel}`);
      statusEl.textContent = `✗ Unknown channel: ${channel}`;
      statusEl.className = 'error';
    }
  },

  reset() {
    if (!this.currentMessage) return;
    this.load(this.currentMessage);
  }
};

// ============================================================================
// Logger
// ============================================================================
const Logger = {
  entries: [],
  filterText: '',

  log(level, body) {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const entry = { time, level, body };
    this.entries.push(entry);

    const container = document.getElementById('log-entries');
    const empty = document.getElementById('log-empty');
    if (empty) empty.style.display = 'none';

    const el = document.createElement('div');
    el.className = `log-entry${this.filterText && !body.toLowerCase().includes(this.filterText) ? ' hidden' : ''}`;
    el.innerHTML = `
      <span class="log-time">${time}</span>
      <span class="log-level ${level}">${level}</span>
      <span class="log-body">${this._escape(body)}</span>
    `;
    container.prepend(el);

    // Update badge
    const badge = document.getElementById('log-badge');
    if (badge) {
      badge.style.display = 'inline';
      badge.textContent = this.entries.length;
    }
  },

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  filter(text) {
    this.filterText = text.toLowerCase();
    const entries = document.querySelectorAll('.log-entry');
    entries.forEach(el => {
      const body = el.querySelector('.log-body')?.textContent || '';
      el.classList.toggle('hidden', !!this.filterText && !body.toLowerCase().includes(this.filterText));
    });
  },

  clear() {
    this.entries = [];
    const container = document.getElementById('log-entries');
    if (container) container.innerHTML = '<div id="log-empty">No messages yet.</div>';
    const badge = document.getElementById('log-badge');
    if (badge) { badge.style.display = 'none'; badge.textContent = '0'; }
  }
};

// ============================================================================
// _synapseSimulatorLogLevel
// Determina el nivel de display para un evento SYNAPSE_SIMULATOR_LOG recibido de
// background.js. Diferencia mensajes entrantes del host (IN), salientes al
// host o a content.js (OUT), errores (ERROR) e informativos genéricos (INFO).
//
// Usado tanto en el listener de SYNAPSE_SIMULATOR_LOG en tiempo real como en el
// procesamiento del replay de SYNAPSE_SIMULATOR_HELLO, para que la UI sea consistente.
// ============================================================================
function _synapseSimulatorLogLevel(data) {
  if (data?._level === 'error') return 'ERROR';
  if (data?._dir  === 'in')    return 'IN';
  if (data?._dir  === 'out')   return 'OUT';
  return 'INFO';
}

// ============================================================================
// ConfigReader
// Lee SYNAPSE_SIMULATOR_CONFIG y SYNAPSE_CONFIG desde los globals inyectados por los
// script tags al final del body (synapse-simulator.synapse.config.js y
// discovery.synapse.config.js). Mismo patrón que discovery/index.html.
// También escucha SYNAPSE_SIMULATOR_CONFIG_READY de background.js como guard de race condition.
// ============================================================================
const ConfigReader = {
  synapseSimulatorConfig: null,
  synapseConfig: null,

  // Lee SYNAPSE_SIMULATOR_CONFIG desde self — inyectado por synapse-simulator.synapse.config.js vía script tag.
  // Mismo patrón que discovery.js lee self.SYNAPSE_CONFIG.
  // No fetch, no eval, no CSP violations.
  async read() {
    this.synapseSimulatorConfig = (typeof self !== 'undefined' && self.SYNAPSE_SIMULATOR_CONFIG)
      ? { ...self.SYNAPSE_SIMULATOR_CONFIG }
      : null;

    this.synapseConfig = (typeof self !== 'undefined' && self.SYNAPSE_CONFIG)
      ? { ...self.SYNAPSE_CONFIG }
      : (window.SYNAPSE_CONFIG || null);

    return { 'synapse-simulator': this.synapseSimulatorConfig, synapse: this.synapseConfig };
  },

  render() {
    const h = this.synapseSimulatorConfig;
    const s = this.synapseConfig;

    const set = (id, value, cls) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (value !== null && value !== undefined) {
        el.textContent = String(value);
        el.className = `config-val ${cls || 'ok'}`;
      } else {
        el.textContent = '—';
        el.className = 'config-val missing';
      }
    };

    set('cfg-profile-id',    h?.profileId);
    set('cfg-profile-alias', h?.profileAlias);
    set('cfg-extension-id',  h?.extensionId);
    set('cfg-dev-mode',      h?.devMode);
    set('cfg-launch-id',     s?.launchId);
    set('cfg-channel',       s?.channel);
    set('cfg-status',        s?.status);

    // Topbar
    if (h?.profileAlias || h?.profileId) {
      const label = document.getElementById('profile-label');
      if (label) label.textContent = h.profileAlias || h.profileId;
    }

    // Raw config
    const raw = document.getElementById('config-raw');
    if (raw) {
      raw.textContent = JSON.stringify({ SYNAPSE_SIMULATOR_CONFIG: h, SYNAPSE_CONFIG: s }, null, 2);
    }

    // Connection status
    const dot = document.getElementById('conn-dot');
    const lbl = document.getElementById('conn-label');
    if (h && s) {
      dot.className = 'status-dot connected';
      lbl.textContent = 'Config loaded';
      Logger.log('INFO', `SYNAPSE_SIMULATOR_CONFIG loaded — profile: ${h.profileId}`);
      Logger.log('INFO', `SYNAPSE_CONFIG loaded — launchId: ${s.launchId}`);
    } else if (h && !s) {
      dot.className = 'status-dot waiting';
      lbl.textContent = 'SYNAPSE_CONFIG missing';
      Logger.log('INFO', 'SYNAPSE_SIMULATOR_CONFIG loaded, SYNAPSE_CONFIG not found');
    } else {
      dot.className = 'status-dot disconnected';
      lbl.textContent = 'No config (dev only)';
      Logger.log('INFO', 'No SYNAPSE_SIMULATOR_CONFIG — running without Sentinel config');
    }
  }
};

// ============================================================================
// SynapseSimulator — top-level coordinator
// ============================================================================
// ============================================================================
// QuickLinks
// Ping liviano a los recursos locales listados en la sección "Quick Links"
// del panel Config (swagger/bootstrap api en :48215, Temporal UI en :8233).
// Solo lectura de disponibilidad — no autentica ni interactúa con nada.
// ============================================================================
const QuickLinks = {
  targets: [
    { id: 'bootstrap', url: 'http://localhost:48215/api/docs' },
    { id: 'temporal',  url: 'http://localhost:8233' },
    { id: 'health',    url: 'http://localhost:48215/api/health/summary' },
  ],

  async checkOne(url) {
    try {
      // El Bootstrap registra @fastify/cors (ver BOOTSTRAP_ARCHITECTURE.md),
      // así que un fetch normal (no 'no-cors') puede leer el status real.
      // Esto importa para /api/health/summary, que puede responder 502 si
      // el exec de "nucleus --json health" falla — un no-cors opaco no
      // distinguiría eso de "puerto caído".
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      return res.ok;
    } catch (_err) {
      // Puede ser el host caído, o un bloqueo CORS real si el puerto
      // responde pero sin el header — en ambos casos lo tratamos como
      // no disponible para el panel.
      return false;
    }
  },

  async checkStatus() {
    for (const t of this.targets) {
      const dot = document.getElementById(`ql-dot-${t.id}`);
      const label = document.getElementById(`ql-status-${t.id}`);
      if (!dot || !label) continue;

      const reachable = await this.checkOne(t.url);
      dot.className = `ql-dot ${reachable ? 'connected' : 'disconnected'}`;
      dot.style.background = reachable ? 'var(--success)' : 'var(--error)';
      label.textContent = reachable ? 'reachable' : 'unreachable';
      Logger.log('INFO', `[QuickLinks] ${t.id} → ${reachable ? 'reachable' : 'unreachable'}`);
    }
  },

  // Componentes críticos según health.go / AUDITORIA_HEALTH_RESOURCES.md §1.
  // Usado solo para el tag visual "crit" en la tabla desplegable — el cálculo
  // real de critical/non-critical ya lo hace server-bootstrap.js.
  CRITICAL_NAMES: ['temporal', 'worker', 'vault', 'governance'],

  async fetchHealthDetail() {
    const res = await fetch('http://localhost:48215/api/health/summary', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  },

  renderHealthDetail(data) {
    const body = document.getElementById('ql-health-body');
    if (!body) return;

    const stateBadge = `<span class="state-badge ${data.system_state}">${data.system_state}</span>`;
    const summaryBar = `
      <div class="ql-health-summary-bar">
        <span>${stateBadge} · ${data.critical_count} críticos, ${data.non_critical_count} no-críticos</span>
        <span style="color:var(--text-muted);">${new Date(data.timestamp * 1000).toLocaleTimeString()}</span>
      </div>
    `;

    const componentNames = Object.keys(data.components || {});
    const rows = componentNames.map((name) => {
      const c = data.components[name] || {};
      const isCrit = this.CRITICAL_NAMES.includes(name);
      const healthy = c.healthy === true;
      const dotColor = healthy ? 'var(--success)' : 'var(--error)';
      const stateText = c.state || '—';
      const errorText = c.error ? c.error : '';
      return `
        <tr>
          <td class="hc-name">${name}${isCrit ? '<span class="crit-tag">[crit]</span>' : ''}</td>
          <td class="hc-state"><span class="hc-dot" style="background:${dotColor};"></span>${stateText}</td>
          <td class="hc-error">${errorText}</td>
        </tr>
      `;
    }).join('');

    const mem = data.resources?.memory;
    const memRow = mem ? `
        <tr>
          <td class="hc-name">memory</td>
          <td class="hc-state"><span class="hc-dot" style="background:${mem.state === 'OK' ? 'var(--success)' : 'var(--warning)'};"></span>${mem.state}</td>
          <td class="hc-error">${mem.message || ''}</td>
        </tr>
    ` : '';

    body.innerHTML = `
      ${summaryBar}
      <table class="ql-health-table"><tbody>${rows}${memRow}</tbody></table>
    `;
  },

  toggleHealthInfo() {
    const panel = document.getElementById('ql-info-panel');
    if (!panel) return;
    panel.classList.toggle('open');
  },

  async toggleHealthDetail() {
    const detail = document.getElementById('ql-health-detail');
    const toggleBtn = document.getElementById('ql-health-toggle');
    const label = document.getElementById('ql-health-toggle-label');
    if (!detail || !toggleBtn) return;

    const isOpen = detail.classList.contains('open');
    if (isOpen) {
      detail.classList.remove('open');
      toggleBtn.classList.remove('expanded');
      label.textContent = 'Ver estado completo (componentes reales)';
      return;
    }

    detail.classList.add('open');
    toggleBtn.classList.add('expanded');
    label.textContent = 'Ocultar estado completo';

    const body = document.getElementById('ql-health-body');
    body.innerHTML = '<div class="ql-health-loading">Cargando desde /api/health/summary…</div>';

    try {
      const data = await this.fetchHealthDetail();
      this.renderHealthDetail(data);
      Logger.log('INFO', `[QuickLinks] health detail loaded — system_state=${data.system_state}`);
    } catch (err) {
      body.innerHTML = `<div class="ql-health-error">No se pudo leer /api/health/summary — ${err.message}</div>`;
      Logger.log('ERROR', `[QuickLinks] health detail fetch failed: ${err.message}`);
    }
  }
};

const SynapseSimulator = {
  _activeTab: 'config',
  _rawConfigVisible: false,

  async init() {
    Logger.log('INFO', 'SynapseSimulator booting…');

    // 1. Read config — lee self.SYNAPSE_SIMULATOR_CONFIG y self.SYNAPSE_CONFIG inyectados por script tags.
    await ConfigReader.read();
    ConfigReader.render();

    // 1a. Quick Links — ping de disponibilidad a swagger/bootstrap api/temporal.
    //     No bloqueante: corre en paralelo, no retrasa el resto del boot.
    QuickLinks.checkStatus();

    // 1b. Listen for late SYNAPSE_SIMULATOR_CONFIG_READY from background.js (race condition guard:
    //     background may load the config after this page is already open).
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.event === 'SYNAPSE_SIMULATOR_CONFIG_READY' && msg.synapseSimulator) {
          ConfigReader.synapseSimulatorConfig = msg.synapseSimulator;
          ConfigReader.render();
          Logger.log('INFO', `SYNAPSE_SIMULATOR_CONFIG_READY received — profile: ${msg.synapseSimulator.profileId}`);
          return;
        }

        // Espejo de messaging real: todo lo que background.js reporta al
        // debug panel (Workspace) llega también acá vía forwardToDebugPanel.
        // Esto es lo que cierra el punto ciego de Native Messaging / runtime
        // — el Cortex SynapseSimulator ahora ve el mismo feed que el Workspace SynapseSimulator.
        if (msg.event === 'SYNAPSE_SIMULATOR_LOG') {
          const level = msg.data?._level === 'error' ? 'ERROR' : 'INFO';
          const tag = `[${msg.category}] ${msg.sourceEvent}`;
          Logger.log(level, `${tag} ${JSON.stringify(msg.data)}`);
        }
      });

      // SYNAPSE_SIMULATOR_HELLO: pedirle a background.js todo lo que pasó antes de que
      // esta tab existiera. Sin esto, cualquier evento emitido entre el boot
      // del sistema y la apertura de esta página se pierde para siempre.
      //
      // Retry con backoff: el SW puede estar todavía procesando host_ready y
      // abriendo tabs cuando esta página ya disparó DOMContentLoaded. En ese
      // caso sendMessage falla con "Could not establish connection" aunque el
      // handler exista — es pura condición de timing de boot. Reintentamos
      // hasta 4 veces antes de rendirse.
      const _HELLO_DELAYS = [0, 200, 500, 1000]; // ms antes de cada intento

      const _sendSynapseSimulatorHello = (attempt) => {
        setTimeout(() => {
          chrome.runtime.sendMessage({ event: 'SYNAPSE_SIMULATOR_HELLO' }, (resp) => {
            const err = chrome.runtime.lastError; // consumir siempre
            if (err) {
              if (attempt < _HELLO_DELAYS.length - 1) {
                // SW todavía arrancando — reintentar
                _sendSynapseSimulatorHello(attempt + 1);
              } else {
                Logger.log('INFO', 'SYNAPSE_SIMULATOR_HELLO: background no disponible (normal en standalone dev)');
              }
              return;
            }
            if (resp?.event === 'SYNAPSE_SIMULATOR_REPLAY' && Array.isArray(resp.entries)) {
              if (resp.entries.length === 0) {
                Logger.log('INFO', 'SYNAPSE_SIMULATOR_HELLO: sin eventos previos en buffer');
              } else {
                Logger.log('INFO', `SYNAPSE_SIMULATOR_HELLO: replay de ${resp.entries.length} evento(s) previos`);
                for (const entry of resp.entries) {
                  const level = entry.data?._level === 'error' ? 'ERROR' : 'INFO';
                  const tag = `[${entry.category}] ${entry.sourceEvent}`;
                  Logger.log(level, `${tag} ${JSON.stringify(entry.data)} (replay)`);
                }
              }
            }
          });
        }, _HELLO_DELAYS[attempt] ?? 1000);
      };

      _sendSynapseSimulatorHello(0);
    }

    // 2. Discover protocols — primero los globales legacy (síncronos),
    //    luego los JSON schemas via chrome.runtime.getURL (async).
    //    Los JSON solo se pushean si el global legacy NO cubrió ese key,
    //    por lo que la coexistencia temporal es segura.
    ProtocolReader.discover();
    await ProtocolReader.discoverFromJSON();
    ProtocolReader.render();
    Logger.log('INFO', `Protocols loaded: ${ProtocolReader.manifests.length} total`);

    // 3. Schedule a second discovery pass for late-loading scripts
    setTimeout(async () => {
      const before = ProtocolReader.manifests.length;
      ProtocolReader.discover();
      await ProtocolReader.discoverFromJSON();
      if (ProtocolReader.manifests.length !== before) {
        ProtocolReader.render();
        Logger.log('INFO', `Late discovery: ${ProtocolReader.manifests.length} protocol(s) total`);
      }
    }, 500);

    // 4. Wire up all UI event listeners (replaces inline onclick= handlers, required by MV3 CSP).
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    const btnSend = document.getElementById('btn-send');
    if (btnSend) btnSend.addEventListener('click', () => this.sendMessage());

    const btnReset = document.getElementById('btn-reset');
    if (btnReset) btnReset.addEventListener('click', () => this.resetForm());

    const btnCopyPayload = document.getElementById('preview-copy-btn');
    if (btnCopyPayload) btnCopyPayload.addEventListener('click', () => this.copyPayload());

    const btnRawToggle = document.getElementById('config-raw-toggle');
    if (btnRawToggle) btnRawToggle.addEventListener('click', () => this.toggleRawConfig());

    const headerDescToggle = document.getElementById('header-desc-toggle');
    if (headerDescToggle) headerDescToggle.addEventListener('click', () => this.toggleHeaderDescription());

    const payloadPreviewToggle = document.getElementById('payload-preview-toggle');
    if (payloadPreviewToggle) payloadPreviewToggle.addEventListener('click', () => this.togglePayloadPreview());

    const logFilter = document.getElementById('log-filter');
    if (logFilter) logFilter.addEventListener('input', () => this.filterLog(logFilter.value));

    const logClear = document.getElementById('log-clear');
    if (logClear) logClear.addEventListener('click', () => this.clearLog());

    Logger.log('INFO', 'SynapseSimulator ready.');
  },

  // ── Public API called from inline handlers ────────────────────────────────

  switchTab(name) {
    this._activeTab = name;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${name}`);
    });
  },

  sendMessage() {
    Simulator.send();
  },

  resetForm() {
    Simulator.reset();
  },

  copyPayload() {
    const code = document.getElementById('payload-preview-code');
    if (!code) return;
    navigator.clipboard.writeText(code.textContent).then(() => {
      this.notify('Payload copied', 'info');
    }).catch(() => {
      this.notify('Copy failed', 'error');
    });
  },

  filterLog(text) {
    Logger.filter(text);
  },

  clearLog() {
    Logger.clear();
  },

  toggleRawConfig() {
    this._rawConfigVisible = !this._rawConfigVisible;
    const el = document.getElementById('config-raw');
    const toggle = document.getElementById('config-raw-toggle');
    if (el) el.style.display = this._rawConfigVisible ? 'block' : 'none';
    if (toggle) toggle.textContent = this._rawConfigVisible ? 'Hide raw config' : 'Show raw config';
  },

  toggleHeaderDescription() {
    const header = document.getElementById('simulate-header');
    const toggle = document.getElementById('header-desc-toggle');
    if (!header || !toggle) return;
    const expanded = header.classList.toggle('expanded');
    toggle.textContent = expanded ? 'Hide details' : 'Show details';
  },

  togglePayloadPreview() {
    const preview = document.getElementById('payload-preview');
    const toggle = document.getElementById('payload-preview-toggle');
    if (!preview || !toggle) return;
    const expanded = preview.classList.toggle('expanded');
    toggle.textContent = expanded ? 'Hide' : 'Show';
  },

  notify(message, type = 'info') {
    const container = document.getElementById('notifications');
    if (!container) return;

    const n = document.createElement('div');
    n.className = `notif ${type}`;
    n.textContent = message;
    container.appendChild(n);

    setTimeout(() => {
      n.style.opacity = '0';
      n.style.transition = 'opacity 0.3s';
      setTimeout(() => n.remove(), 300);
    }, 3000);
  }
};

// ============================================================================
// Boot
// ============================================================================

/**
 * Carga un script externo de forma condicional.
 * Primero verifica la existencia con fetch() para evitar errores de red
 * en DevTools cuando el archivo no existe (post-onboarding only).
 * Si el archivo no existe o falla, resuelve sin lanzar error.
 */
function loadScriptOptional(src) {
  return new Promise((resolve) => {
    // Resolve URL relativo al documento actual
    const url = new URL(src, document.baseURI).href;

    fetch(url, { method: 'HEAD' })
      .then(res => {
        if (!res.ok) {
          console.log(`[SynapseSimulator] ↷ Not found (skipped): ${src}`);
          return resolve();
        }
        const s = document.createElement('script');
        s.src = url;
        s.onload  = () => { console.log(`[SynapseSimulator] ✓ Loaded: ${src}`); resolve(); };
        s.onerror = () => { console.log(`[SynapseSimulator] ↷ Load error (skipped): ${src}`); resolve(); };
        document.head.appendChild(s);
      })
      .catch(() => {
        console.log(`[SynapseSimulator] ↷ Not found (skipped): ${src}`);
        resolve();
      });
  });
}

/**
 * Boot sequence:
 * 1. Carga configs y protocolos requeridos (siempre presentes desde seed --dev).
 * 2. Intenta cargar landing config + protocolo — solo existen post-onboarding.
 *    Si no existen, el SynapseSimulator arranca igual sin ellos.
 * 3. Lanza SynapseSimulator.init() una vez que todos los scripts que van a llegar, llegaron.
 */
document.addEventListener('DOMContentLoaded', async () => {
  // --- Siempre presentes desde seed --dev ---
  await loadScriptOptional('../synapse-simulator.synapse.config.js');
  await loadScriptOptional('../discovery.synapse.config.js');
  await loadScriptOptional('../discovery/discoveryProtocol.js');
  await loadScriptOptional('synapseSimulatorProtocol.js');

  // --- Solo existen post-onboarding ---
  await loadScriptOptional('../landing.synapse.config.js');
  await loadScriptOptional('../landing/landingProtocol.js');

  // Todos los scripts que van a llegar, llegaron. Arrancar.
  SynapseSimulator.init();
});
