'use strict';

/**
 * shared/synapse-bridge.js
 *
 * Puente entre Brain ServerManager (TCP puerto fijo) y cualquier ventana
 * Electron del ecosistema Bloom. Compartido entre setup/ y workspace/.
 *
 * PROTOCOLO:
 *   Brain ServerManager escucha en TCP 127.0.0.1:5678 (puerto FIJO).
 *   Wire format: [4 bytes UInt32 Big Endian = longitud][JSON payload UTF-8]
 *   Límite: 1 MB por mensaje (coincide con ServerManager).
 *
 *   El bridge se registra como Sentinel (REGISTER_CLI) al conectar y recibe
 *   todos los broadcasts del EventBus de Brain.
 *
 * SEÑAL DE HANDSHAKE COMPLETADO:
 *   Cuando Chrome Host se registra en Brain con REGISTER_HOST, Brain:
 *     1. Llama ProfileStateManager.set_profile_online() → escribe ONLINE en profiles.json
 *     2. Emite PROFILE_CONNECTED al EventBus
 *     3. Hace broadcast de PROFILE_CONNECTED a todos los Sentinels registrados
 *   El bridge recibe ese broadcast y lo clasifica como 'HANDSHAKE' para el renderer.
 *   Es una señal push — no hay polling, no hay race condition.
 *
 * CATCH-UP (race condition de timing):
 *   Si PROFILE_CONNECTED ocurrió antes de que el bridge conectase (ej: el
 *   instalador tardó en levantar el socket), Brain no re-emite el evento.
 *   Al recibir REGISTER_ACK el bridge emite el flag `catch_up_needed: true`
 *   para que el caller pueda hacer un poll CLI de seguridad (nucleus:status)
 *   y así no quedarse esperando eternamente un evento que ya pasó.
 *   Ver: connectToBrain() y el handler install:start en main.js.
 *
 * CAMBIOS v3 (sesión 2026-06):
 *   1. ONBOARDING_EVENTS: Set exportado con los eventos de hitos del onboarding
 *   2. _classifyMessage: nuevo case ONBOARDING_MILESTONE — captura todos los eventos
 *      del Set antes del fallback genérico. El MilestoneRegistry puede extender el
 *      Set en runtime sin tocar este archivo.
 *   3. module.exports: agrega ONBOARDING_EVENTS para extensión externa.
 *
 * CAMBIOS v2 (sesión 2025-05):
 *   1. _classifyMessage: maneja profile_id en top-level además de data.profile_id
 *   2. connectToBrain: delay inicial 200ms en lugar de 1500ms (Brain ya está corriendo)
 *   3. _nucleus: timeout configurable de 60s con kill limpio del proceso
 *   4. REGISTER_ACK: emite catch_up_needed: true para que el caller haga poll de safety
 *   5. Constantes del EventEmitter y del canal IPC separadas (naming clarity)
 *   6. workspace-synapse-handlers: pasa launchId en synapse:launch
 */

const { spawn }        = require('child_process');
const net              = require('net');
const os               = require('os');
const path             = require('path');
const { EventEmitter } = require('events');

// ─── Canal IPC Electron (main → renderer via webContents.send) ───────────────
// Debe coincidir exactamente con el que usa preload-synapse.js.
const SYNAPSE_IPC_CHANNEL = 'synapse:event';

// ─── Canal del EventEmitter interno del main process ─────────────────────────
// Mismo valor que SYNAPSE_IPC_CHANNEL para mantener compatibilidad con el
// código existente en main.js que escucha con .on('synapse:event', ...).
// Se separan en dos constantes para que quede claro qué corresponde a qué capa.
const SYNAPSE_EMITTER_EVENT = 'synapse:event';

// ─── Puerto fijo del ServerManager de Brain ──────────────────────────────────
const BRAIN_SERVER_PORT = 5678;

// ─── Timings ─────────────────────────────────────────────────────────────────
// connectToBrain: Brain ya está corriendo → delay mínimo
const TCP_CONNECT_BRAIN_DELAY_MS = 200;
// _doLaunch (seedAndLaunch/launch): Brain puede estar arrancando → delay mayor
const TCP_INITIAL_DELAY_MS       = 1_500;

const TCP_RECONNECT_BASE_MS = 2_000;
const TCP_RECONNECT_MAX_MS  = 30_000;
const HEARTBEAT_WATCHDOG_MS = 20_000;  // sin actividad en 20s → fase DEGRADED

// ─── Timeout del CLI nucleus ─────────────────────────────────────────────────
const NUCLEUS_CMD_TIMEOUT_MS = 60_000;  // 60s; configurable por instancia

// ─── Límite de mensaje ───────────────────────────────────────────────────────
const MSG_MAX_BYTES = 1024 * 1024;

// ─── Resolución del BloomRoot por plataforma ─────────────────────────────────
function getBloomRoot() {
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'BloomNucleus');
    case 'win32':
      return path.join(process.env.LOCALAPPDATA || os.homedir(), 'BloomNucleus');
    default:
      return path.join(
        process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
        'BloomNucleus'
      );
  }
}

// ─── Set de eventos de onboarding conocidos ──────────────────────────────────
//
// Fuente de verdad: DISCOVERY_PROTOCOL_MANIFEST en discoveryProtocol.js (Cortex).
// Este Set debe coincidir con los observable_events declarados en ese manifest.
//
// Para agregar un evento nuevo:
//   1. Añadirlo al DISCOVERY_PROTOCOL_MANIFEST en discoveryProtocol.js
//   2. Añadirlo aquí
//   3. Añadir el handler correspondiente en MilestoneReactor (milestone-reactor.js)
//
// El MilestoneRegistry puede extender este Set en runtime para eventos
// declarados en config/onboarding/milestone-config.json (ver milestone-registry.js).
//
const ONBOARDING_EVENTS = new Set([
  // ── Discovery / GitHub ────────────────────────────────────────────────────
  'GITHUB_PAT_DETECTED',        // Cortex detectó un PAT en clipboard — pre-confirmación
  'GITHUB_TOKEN_STORED',        // Brain persistió el fingerprint del PAT en nucleus.json
  'ACCOUNT_REGISTERED',         // Cuenta creada en Nucleus con el token validado

  // ── Vault ────────────────────────────────────────────────────────────────
  'VAULT_INITIALIZED',          // Vault creado y cifrado correctamente
  'VAULT_INIT',                 // Alias alternativo que algunos builds de Brain emiten

  // ── Google / AI providers ────────────────────────────────────────────────
  'GOOGLE_AUTH_COMPLETE',       // OAuth Google completado
  'AI_PROVIDER_CONFIGURED',     // API key de proveedor IA almacenada en vault

  // ── Proyecto ─────────────────────────────────────────────────────────────
  'PROJECT_CREATED',            // Primer proyecto creado en Nucleus

  // ── Flujo completo ────────────────────────────────────────────────────────
  'ONBOARDING_STEP_COMPLETE',   // Brain confirma un step genérico (incluye step ID en payload)
  'DISCOVERY_COMPLETE',         // Todos los steps del onboarding completados — señal de cierre
  'SITE_READY',                 // Señal auxiliar de ionsite — sitio listo para automatización
]);

// ─── SynapseBridge ───────────────────────────────────────────────────────────

class SynapseBridge extends EventEmitter {
  /**
   * @param {object}                     opts
   * @param {Electron.BrowserWindow}     opts.mainWindow       Ventana cuyo renderer recibirá los eventos
   * @param {string}                    [opts.nucleusBinary]   Nombre o path del binario nucleus (default: 'nucleus')
   * @param {number}                    [opts.brainPort]       Puerto del ServerManager (default: 5678)
   * @param {string}                    [opts.bloomRoot]       Override del BloomRoot (útil en tests)
   * @param {boolean}                   [opts.verbose]         Log detallado en consola del main process
   * @param {number}                    [opts.nucleusTimeout]  Timeout en ms para comandos nucleus (default: 60000)
   */
  constructor({
    mainWindow,
    nucleusBinary  = 'nucleus',
    brainPort      = BRAIN_SERVER_PORT,
    bloomRoot,
    verbose        = false,
    nucleusTimeout = NUCLEUS_CMD_TIMEOUT_MS,
  }) {
    super();

    this._win            = mainWindow;
    this._bin            = nucleusBinary;
    this._port           = brainPort;
    this._bloomRoot      = bloomRoot || getBloomRoot();
    this._verbose        = verbose;
    this._nucleusTimeout = nucleusTimeout;

    // Estado de sesión
    this._profileId = null;
    this._launchId  = null;

    // Estado de conexión TCP
    this._socket         = null;
    this._buf            = Buffer.alloc(0);
    this._reconnectDelay = TCP_RECONNECT_BASE_MS;
    this._reconnectTimer = null;

    // Watchdog de heartbeat
    this._watchdog  = null;
    this._destroyed = false;
  }

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Crea el perfil en Temporal (seed) y lanza Chrome + Sentinel (launch).
   * Emite eventos de progreso al renderer durante todo el proceso.
   *
   * @param {string}  alias
   * @param {object}  [opts]
   * @param {boolean} [opts.master=false]
   * @param {string}  [opts.mode='discovery']
   * @returns {Promise<{ profileId: string, launchId: string }>}
   */
  async seedAndLaunch(alias, { master = false, mode = 'discovery' } = {}) {
    this._emit({ type: 'STATUS', phase: 'SEEDING', message: `Creando perfil "${alias}"…` });

    const seedResult = await this._nucleus(['seed', alias, ...(master ? ['--master'] : [])]);
    this._profileId  = seedResult.profile_id;

    this._emit({
      type:      'STATUS',
      phase:     'SEEDED',
      message:   'Perfil creado',
      profileId: this._profileId,
    });

    return this._doLaunch(mode);
  }

  /**
   * Lanza un perfil ya existente (seed previo).
   *
   * @param {string}  profileIdOrAlias
   * @param {object}  [opts]
   * @param {string}  [opts.mode='landing']
   * @returns {Promise<{ profileId: string, launchId: string }>}
   */
  async launch(profileIdOrAlias, { mode = 'landing' } = {}) {
    this._profileId = profileIdOrAlias;
    return this._doLaunch(mode);
  }

  /**
   * Conecta al ServerManager de Brain para un perfil ya lanzado externamente.
   * No ejecuta `nucleus` — solo establece la conexión TCP y espera broadcasts.
   *
   * Cuándo usar esto: el installer ya corrió `nucleus launch` y obtuvo un
   * `profile_id` / `launch_id`. No queremos relanzar el perfil; solo queremos
   * recibir el evento PROFILE_CONNECTED (handshake completado) que Brain emite
   * cuando Cortex hace REGISTER_HOST exitosamente.
   *
   * IMPORTANTE — race condition de timing:
   *   Si PROFILE_CONNECTED ya ocurrió antes de que este bridge conecte, Brain
   *   no re-emite el evento. En ese caso el bridge recibirá REGISTER_ACK y
   *   emitirá un STATUS con catch_up_needed: true para que el caller dispare
   *   un poll CLI como safety net (ver install:start en main.js).
   *
   * @param {string}  profileId
   * @param {string}  [launchId=null]
   * @returns {this}
   */
  connectToBrain(profileId, launchId = null) {
    this._profileId = profileId;
    this._launchId  = launchId;
    this._emit({ type: 'STATUS', phase: 'CONNECTING', message: 'Conectando a Brain ServerManager…' });
    // Brain ya está corriendo cuando se llama connectToBrain → delay mínimo.
    // (Contrasta con _doLaunch donde Brain puede estar arrancando → 1500ms.)
    this._reconnectTimer = setTimeout(() => this._connectTCP(), TCP_CONNECT_BRAIN_DELAY_MS);
    return this;
  }

  /**
   * Limpia todos los recursos. Llamar en el evento 'closed' de la BrowserWindow.
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._clearWatchdog();
    clearTimeout(this._reconnectTimer);
    if (this._socket) {
      this._socket.destroy();
      this._socket = null;
    }
    this.removeAllListeners();
  }

  // ── Internals: nucleus CLI ──────────────────────────────────────────────────

  async _doLaunch(mode) {
    this._emit({ type: 'STATUS', phase: 'LAUNCHING', message: 'Lanzando Chrome + Sentinel…' });

    const launchResult = await this._nucleus(['launch', this._profileId, '--mode', mode]);
    this._launchId = launchResult.launch_id;

    this._emit({
      type:      'STATUS',
      phase:     'LAUNCHED',
      message:   `Chrome PID ${launchResult.chrome_pid} · debug :${launchResult.debug_port}`,
      profileId: this._profileId,
      launchId:  this._launchId,
      chromePid: launchResult.chrome_pid,
      debugPort: launchResult.debug_port,
    });

    // Conectar con delay mayor: Brain puede estar arrancando junto al perfil.
    this._reconnectTimer = setTimeout(() => this._connectTCP(), TCP_INITIAL_DELAY_MS);

    return { profileId: this._profileId, launchId: this._launchId };
  }

  /**
   * Ejecuta `nucleus --json synapse <args>` y retorna el objeto JSON parseado.
   * Rechaza si el proceso falla, no responde en `this._nucleusTimeout` ms,
   * o si result.success === false.
   */
  _nucleus(args) {
    return new Promise((resolve, reject) => {
      const fullArgs = ['--json', 'synapse', ...args];
      this._log('→ nucleus', fullArgs.join(' '));

      const proc = spawn(this._bin, fullArgs);
      let stdout = '';
      let stderr = '';
      let settled = false;

      const settle = (fn) => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        fn();
      };

      // Timeout: si nucleus no responde en _nucleusTimeout ms, lo matamos.
      const killTimer = setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
        settle(() => reject(new Error(
          `nucleus timeout (${this._nucleusTimeout}ms): ${fullArgs.join(' ')}`
        )));
      }, this._nucleusTimeout);

      proc.stdout.on('data', d => (stdout += d.toString()));
      proc.stderr.on('data', d => (stderr += d.toString()));

      proc.on('close', code => {
        settle(() => {
          this._log('← nucleus exit', code, '|', stdout.trim().slice(0, 120));
          if (code !== 0) {
            return reject(new Error(`nucleus exited ${code}: ${(stderr || stdout).trim()}`));
          }
          let result;
          try {
            result = JSON.parse(stdout.trim());
          } catch {
            return reject(new Error(`nucleus: JSON inválido: ${stdout.slice(0, 200)}`));
          }
          if (!result.success) {
            return reject(new Error(result.error || 'nucleus command failed'));
          }
          resolve(result);
        });
      });

      proc.on('error', err =>
        settle(() => reject(new Error(`No se pudo ejecutar nucleus: ${err.message}`)))
      );
    });
  }

  // ── Internals: TCP connection ───────────────────────────────────────────────

  /**
   * Conecta a Brain ServerManager en 127.0.0.1:{this._port}.
   * Al establecer conexión envía REGISTER_CLI para empezar a recibir broadcasts.
   */
  _connectTCP() {
    if (this._destroyed) return;

    this._log(`Conectando a Brain ServerManager TCP 127.0.0.1:${this._port}`);
    this._emit({
      type:    'STATUS',
      phase:   'CONNECTING',
      message: `Conectando a Brain (puerto ${this._port})…`,
    });

    const socket = net.createConnection({ host: '127.0.0.1', port: this._port }, () => {
      this._log('Brain ServerManager conectado ✓');
      this._reconnectDelay = TCP_RECONNECT_BASE_MS;  // reset backoff

      // Registrarse como Sentinel: Brain empezará a hacer broadcast de eventos.
      this._sendMsg({ type: 'REGISTER_CLI' });

      this._emit({ type: 'STATUS', phase: 'CONNECTED', message: 'Conexión con Brain establecida' });
      this._resetWatchdog();
    });

    socket.on('data',  chunk => this._onData(chunk));
    socket.on('error', err   => this._onSocketError(err));
    socket.on('close', ()    => this._onSocketClose());

    this._socket = socket;
    this._buf    = Buffer.alloc(0);
  }

  _onSocketError(err) {
    this._log('Socket error:', err.message);
    // ECONNREFUSED es transitorio (Brain todavía arrancando o aún no conectado)
    if (err.code !== 'ECONNREFUSED') {
      this._emit({ type: 'ERROR', message: `Socket: ${err.message}` });
    }
  }

  _onSocketClose() {
    this._log('Socket cerrado');
    this._clearWatchdog();
    this._socket = null;
    if (this._destroyed) return;

    this._emit({ type: 'STATUS', phase: 'DISCONNECTED', message: 'Desconectado de Brain. Reconectando…' });

    // Reconectar con backoff exponencial al mismo puerto fijo
    this._reconnectTimer = setTimeout(() => this._connectTCP(), this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, TCP_RECONNECT_MAX_MS);
  }

  // ── Internals: protocolo Brain (4-byte BigEndian + JSON) ─────────────────────

  /**
   * Envía un mensaje a Brain con framing de 4 bytes BigEndian.
   * Solo se puede llamar cuando el socket está conectado.
   */
  _sendMsg(payload) {
    if (!this._socket || this._socket.destroyed) return;
    try {
      const body   = Buffer.from(JSON.stringify(payload), 'utf-8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length, 0);
      this._socket.write(Buffer.concat([header, body]));
      this._log('→ Brain:', JSON.stringify(payload).slice(0, 80));
    } catch (err) {
      this._log('_sendMsg error:', err.message);
    }
  }

  /**
   * Acumula chunks del stream y extrae mensajes completos.
   * Wire format: [UInt32 Big Endian = N][N bytes JSON UTF-8]
   */
  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);

    while (this._buf.length >= 4) {
      const msgLen = this._buf.readUInt32BE(0);

      if (msgLen > MSG_MAX_BYTES) {
        this._log(`Mensaje sospechoso (${msgLen} bytes), reseteando buffer`);
        this._buf = Buffer.alloc(0);
        return;
      }

      if (this._buf.length < 4 + msgLen) break;  // mensaje incompleto, esperar más datos

      const jsonBuf = this._buf.slice(4, 4 + msgLen);
      this._buf     = this._buf.slice(4 + msgLen);

      try {
        const msg = JSON.parse(jsonBuf.toString('utf8'));
        this._onBrainMessage(msg);
      } catch (e) {
        this._log(`Parse error: ${e.message} | raw: ${jsonBuf.slice(0, 80)}`);
      }
    }
  }

  /**
   * Clasifica el mensaje y lo envía al renderer enriquecido con metadata.
   */
  _onBrainMessage(msg) {
    this._log('← Brain:', JSON.stringify(msg).slice(0, 120));
    this._resetWatchdog();

    const classified = this._classifyMessage(msg);

    const enriched = {
      ...msg,
      type:       classified.type,
      _ts:        Date.now(),
      _profileId: this._profileId,
      _launchId:  this._launchId,
      // catch_up_needed solo se incluye si el clasificador lo señala
      ...(classified.catch_up_needed ? { catch_up_needed: true } : {}),
    };

    this._emit(enriched);
    this.emit('message', enriched);  // también disponible en el main process
  }

  /**
   * Clasifica un mensaje entrante de Brain en un tipo semántico para el renderer.
   *
   * Retorna { type: string, catch_up_needed?: boolean }
   *
   * Maneja dos formatos de mensajes posibles:
   *
   * Formato A — EventBus broadcast (emitido por ServerManager):
   *   { type: 'PROFILE_CONNECTED', timestamp: <ns>, data: { profile_id: '...' } }
   *   { type: 'PROFILE_CONNECTED', profile_id: '...' }    ← top-level (algunos builds)
   *   { type: 'PROFILE_DISCONNECTED', ... }
   *   { type: 'BRAIN_SERVICE_STATUS', ... }
   *   { type: 'REGISTER_ACK', conn_id: '...', role: 'cli' }
   *
   * Formato B — Chrome Native Messaging reenviado por Chrome Host:
   *   { command: 'HEARTBEAT', ... }
   *   { event: 'HANDSHAKE_CONFIRMED', ... }
   *   { event: 'HOST_READY', ... }
   *   { event: 'INTENT_STARTED', ... }
   *   { event: 'GITHUB_TOKEN_STORED', ... }   ← ahora → ONBOARDING_MILESTONE
   *   { event: 'ONBOARDING_STEP_COMPLETE', ... } ← ahora → ONBOARDING_MILESTONE
   */
  _classifyMessage(msg) {
    const msgType = (msg.type    || '').toUpperCase();
    const cmd     = (msg.command || '').toUpperCase();
    const event   = (msg.event   || '').toUpperCase();

    // ── Formato A: EventBus broadcasts ──────────────────────────────────────

    if (msgType === 'PROFILE_CONNECTED') {
      // El profile_id puede llegar en data.profile_id (formato canónico) o en
      // el top-level del mensaje (variante observada en algunos builds de Brain).
      const evProfileId = msg.data?.profile_id ?? msg.profile_id ?? null;

      // Si no trae profile_id o coincide con el nuestro → es nuestro handshake
      if (!evProfileId || evProfileId === this._profileId) {
        return { type: 'HANDSHAKE' };
      }
      // PROFILE_CONNECTED de otro perfil en el mismo server → pass-through
      return { type: 'PROFILE' };
    }

    if (msgType === 'PROFILE_DISCONNECTED') return { type: 'PROFILE' };
    if (msgType === 'BRAIN_SERVICE_STATUS') return { type: 'STATUS' };

    // ACK de nuestro REGISTER_CLI: confirma que somos un Sentinel activo.
    // Señalamos catch_up_needed para que el caller haga un poll de safety
    // (PROFILE_CONNECTED podría haber ocurrido antes de que conectásemos).
    if (msgType === 'REGISTER_ACK') {
      return { type: 'STATUS', catch_up_needed: true };
    }

    // ── Formato B: Chrome Native Messaging (reenviado por Chrome Host) ──────
    if (cmd === 'HEARTBEAT' || event === 'HEARTBEAT') return { type: 'HEARTBEAT' };
    if (event === 'HANDSHAKE_CONFIRMED')              return { type: 'HANDSHAKE' };
    if (event === 'HOST_READY')                       return { type: 'HOST_READY' };
    if (event.startsWith('INTENT_'))                  return { type: 'INTENT' };
    if (event.startsWith('ION_'))                     return { type: 'ION' };
    if (event.startsWith('PROFILE_'))                 return { type: 'PROFILE' };

    // ── ONBOARDING_MILESTONE ─────────────────────────────────────────────────
    //
    // Captura todos los eventos de progreso del onboarding antes del fallback.
    // El Set ONBOARDING_EVENTS (exportado) es la única fuente de clasificación:
    // no se inspecciona el payload, no se hacen comparaciones de strings inline.
    // El MilestoneRegistry puede extender este Set en runtime sin tocar este archivo.
    //
    if (ONBOARDING_EVENTS.has(event)) {
      return { type: 'ONBOARDING_MILESTONE' };
    }

    // ── Fallback ─────────────────────────────────────────────────────────────
    if (msg.type) return { type: msg.type };
    return { type: 'SYNAPSE_EVENT' };
  }

  // ── Internals: heartbeat watchdog ───────────────────────────────────────────

  _resetWatchdog() {
    this._clearWatchdog();
    this._watchdog = setTimeout(() => {
      this._log('Heartbeat timeout');
      this._emit({
        type:    'STATUS',
        phase:   'DEGRADED',
        message: 'Sin actividad de Brain. El perfil puede haber caído.',
      });
    }, HEARTBEAT_WATCHDOG_MS);
  }

  _clearWatchdog() {
    if (this._watchdog) {
      clearTimeout(this._watchdog);
      this._watchdog = null;
    }
  }

  // ── Internals: envío al renderer ─────────────────────────────────────────────

  /**
   * Único punto de salida hacia la UI.
   * Envía al renderer via webContents.send() y también emite en el EventEmitter
   * del main process por si algún código en main.js también escucha.
   */
  _emit(payload) {
    // EventEmitter del main process (constante separada para naming clarity)
    this.emit(SYNAPSE_EMITTER_EVENT, payload);
    try {
      if (this._win && !this._win.isDestroyed()) {
        // Canal IPC Electron → renderer (coincide con preload-synapse.js)
        this._win.webContents.send(SYNAPSE_IPC_CHANNEL, payload);
      }
    } catch {
      // ventana destruida mid-flight, ignorar
    }
  }

  _log(...args) {
    if (this._verbose) console.log('[SynapseBridge]', ...args);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  SynapseBridge,
  SYNAPSE_IPC_CHANNEL,
  SYNAPSE_EMITTER_EVENT,
  getBloomRoot,
  BRAIN_SERVER_PORT,
  ONBOARDING_EVENTS,   // extensible en runtime por MilestoneRegistry
};
