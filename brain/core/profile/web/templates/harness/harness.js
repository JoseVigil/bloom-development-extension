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
      'IONPUMP_PROTOCOL_MANIFEST',
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
      { file: 'protocols/ionpump.schema.json',   key: 'IONPUMP_PROTOCOL_MANIFEST'   },
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

      if (param.type === 'auto') {
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
      Harness.notify('Seleccioná un mensaje primero', 'error');
      return;
    }

    const payload = this._buildPayload();
    const statusEl = document.getElementById('send-status');

    // Determine channel
    const channel = msg.channel || 'runtime';

    if (channel === 'runtime') {
      // Send via chrome.runtime.sendMessage to background
      const extensionId = ConfigReader.harnessConfig?.extensionId;

      if (typeof chrome === 'undefined' || !chrome.runtime) {
        Logger.log('ERR', `chrome.runtime not available`);
        statusEl.textContent = '✗ chrome.runtime unavailable';
        statusEl.className = 'error';
        Harness.notify('chrome.runtime not available — are you inside the extension?', 'error');
        return;
      }

      const target = extensionId || chrome.runtime.id;
      Logger.log('SEND', `→ ${msg.id} [${channel}] target=${target} ${JSON.stringify(payload)}`);

      try {
        // No pasar extensionId explícito: desde una página interna de la extensión,
        // sendMessage sin target ya enruta al propio background.
        // Con target explícito Chrome trata el mensaje como cross-extension y lo rechaza
        // a menos que manifest.json declare externally_connectable.
        chrome.runtime.sendMessage(payload, (response) => {
          const err = chrome.runtime.lastError; // consumir sincrónicamente
          if (err) {
            Logger.log('ERR', err.message);
            statusEl.textContent = '✗ Error';
            statusEl.className = 'error';
            Harness.notify(err.message, 'error');
          } else {
            const responseStr = response !== undefined ? JSON.stringify(response) : 'null (fire-and-forget)';
            Logger.log('ACK', responseStr);
            statusEl.textContent = '✓ Sent';
            statusEl.className = 'ok';
            Harness.notify(`${msg.id} sent`, 'success');
          }
        });
      } catch (e) {
        Logger.log('ERR', e.message);
        statusEl.textContent = '✗ Exception';
        statusEl.className = 'error';
        Harness.notify(e.message, 'error');
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
// _harnessLogLevel
// Determina el nivel de display para un evento HARNESS_LOG recibido de
// background.js. Diferencia mensajes entrantes del host (IN), salientes al
// host o a content.js (OUT), errores (ERROR) e informativos genéricos (INFO).
//
// Usado tanto en el listener de HARNESS_LOG en tiempo real como en el
// procesamiento del replay de HARNESS_HELLO, para que la UI sea consistente.
// ============================================================================
function _harnessLogLevel(data) {
  if (data?._level === 'error') return 'ERROR';
  if (data?._dir  === 'in')    return 'IN';
  if (data?._dir  === 'out')   return 'OUT';
  return 'INFO';
}

// ============================================================================
// ConfigReader
// Lee HARNESS_CONFIG y SYNAPSE_CONFIG desde los globals inyectados por los
// script tags al final del body (harness.synapse.config.js y
// discovery.synapse.config.js). Mismo patrón que discovery/index.html.
// También escucha HARNESS_CONFIG_READY de background.js como guard de race condition.
// ============================================================================
const ConfigReader = {
  harnessConfig: null,
  synapseConfig: null,

  // Lee HARNESS_CONFIG desde self — inyectado por harness.synapse.config.js vía script tag.
  // Mismo patrón que discovery.js lee self.SYNAPSE_CONFIG.
  // No fetch, no eval, no CSP violations.
  async read() {
    this.harnessConfig = (typeof self !== 'undefined' && self.HARNESS_CONFIG)
      ? { ...self.HARNESS_CONFIG }
      : null;

    this.synapseConfig = (typeof self !== 'undefined' && self.SYNAPSE_CONFIG)
      ? { ...self.SYNAPSE_CONFIG }
      : (window.SYNAPSE_CONFIG || null);

    return { harness: this.harnessConfig, synapse: this.synapseConfig };
  },

  render() {
    const h = this.harnessConfig;
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
      raw.textContent = JSON.stringify({ HARNESS_CONFIG: h, SYNAPSE_CONFIG: s }, null, 2);
    }

    // Connection status
    const dot = document.getElementById('conn-dot');
    const lbl = document.getElementById('conn-label');
    if (h && s) {
      dot.className = 'status-dot connected';
      lbl.textContent = 'Config loaded';
      Logger.log('INFO', `HARNESS_CONFIG loaded — profile: ${h.profileId}`);
      Logger.log('INFO', `SYNAPSE_CONFIG loaded — launchId: ${s.launchId}`);
    } else if (h && !s) {
      dot.className = 'status-dot waiting';
      lbl.textContent = 'SYNAPSE_CONFIG missing';
      Logger.log('INFO', 'HARNESS_CONFIG loaded, SYNAPSE_CONFIG not found');
    } else {
      dot.className = 'status-dot disconnected';
      lbl.textContent = 'No config (dev only)';
      Logger.log('INFO', 'No HARNESS_CONFIG — running without Sentinel config');
    }
  }
};

// ============================================================================
// Harness — top-level coordinator
// ============================================================================
const Harness = {
  _activeTab: 'config',
  _rawConfigVisible: false,

  async init() {
    Logger.log('INFO', 'Harness booting…');

    // 1. Read config — lee self.HARNESS_CONFIG y self.SYNAPSE_CONFIG inyectados por script tags.
    await ConfigReader.read();
    ConfigReader.render();

    // 1b. Listen for late HARNESS_CONFIG_READY from background.js (race condition guard:
    //     background may load the config after this page is already open).
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.event === 'HARNESS_CONFIG_READY' && msg.harness) {
          ConfigReader.harnessConfig = msg.harness;
          ConfigReader.render();
          Logger.log('INFO', `HARNESS_CONFIG_READY received — profile: ${msg.harness.profileId}`);
          return;
        }

        // Espejo de messaging real: todo lo que background.js reporta al
        // debug panel (Workspace) llega también acá vía forwardToDebugPanel.
        // Esto es lo que cierra el punto ciego de Native Messaging / runtime
        // — el Cortex Harness ahora ve el mismo feed que el Workspace Harness.
        if (msg.event === 'HARNESS_LOG') {
          const level = msg.data?._level === 'error' ? 'ERROR' : 'INFO';
          const tag = `[${msg.category}] ${msg.sourceEvent}`;
          Logger.log(level, `${tag} ${JSON.stringify(msg.data)}`);
        }
      });

      // HARNESS_HELLO: pedirle a background.js todo lo que pasó antes de que
      // esta tab existiera. Sin esto, cualquier evento emitido entre el boot
      // del sistema y la apertura de esta página se pierde para siempre.
      //
      // Retry con backoff: el SW puede estar todavía procesando host_ready y
      // abriendo tabs cuando esta página ya disparó DOMContentLoaded. En ese
      // caso sendMessage falla con "Could not establish connection" aunque el
      // handler exista — es pura condición de timing de boot. Reintentamos
      // hasta 4 veces antes de rendirse.
      const _HELLO_DELAYS = [0, 200, 500, 1000]; // ms antes de cada intento

      const _sendHarnessHello = (attempt) => {
        setTimeout(() => {
          chrome.runtime.sendMessage({ event: 'HARNESS_HELLO' }, (resp) => {
            const err = chrome.runtime.lastError; // consumir siempre
            if (err) {
              if (attempt < _HELLO_DELAYS.length - 1) {
                // SW todavía arrancando — reintentar
                _sendHarnessHello(attempt + 1);
              } else {
                Logger.log('INFO', 'HARNESS_HELLO: background no disponible (normal en standalone dev)');
              }
              return;
            }
            if (resp?.event === 'HARNESS_REPLAY' && Array.isArray(resp.entries)) {
              if (resp.entries.length === 0) {
                Logger.log('INFO', 'HARNESS_HELLO: sin eventos previos en buffer');
              } else {
                Logger.log('INFO', `HARNESS_HELLO: replay de ${resp.entries.length} evento(s) previos`);
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

      _sendHarnessHello(0);
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

    const logFilter = document.getElementById('log-filter');
    if (logFilter) logFilter.addEventListener('input', () => this.filterLog(logFilter.value));

    const logClear = document.getElementById('log-clear');
    if (logClear) logClear.addEventListener('click', () => this.clearLog());

    Logger.log('INFO', 'Harness ready.');
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
          console.log(`[Harness] ↷ Not found (skipped): ${src}`);
          return resolve();
        }
        const s = document.createElement('script');
        s.src = url;
        s.onload  = () => { console.log(`[Harness] ✓ Loaded: ${src}`); resolve(); };
        s.onerror = () => { console.log(`[Harness] ↷ Load error (skipped): ${src}`); resolve(); };
        document.head.appendChild(s);
      })
      .catch(() => {
        console.log(`[Harness] ↷ Not found (skipped): ${src}`);
        resolve();
      });
  });
}

/**
 * Boot sequence:
 * 1. Carga configs y protocolos requeridos (siempre presentes desde seed --dev).
 * 2. Intenta cargar landing config + protocolo — solo existen post-onboarding.
 *    Si no existen, el Harness arranca igual sin ellos.
 * 3. Lanza Harness.init() una vez que todos los scripts que van a llegar, llegaron.
 */
document.addEventListener('DOMContentLoaded', async () => {
  // --- Siempre presentes desde seed --dev ---
  await loadScriptOptional('../harness.synapse.config.js');
  await loadScriptOptional('../discovery.synapse.config.js');
  await loadScriptOptional('../discovery/discoveryProtocol.js');
  await loadScriptOptional('ionpump_protocol.js');

  // --- Solo existen post-onboarding ---
  await loadScriptOptional('../landing.synapse.config.js');
  await loadScriptOptional('../landing/landingProtocol.js');

  // Todos los scripts que van a llegar, llegaron. Arrancar.
  Harness.init();
});
