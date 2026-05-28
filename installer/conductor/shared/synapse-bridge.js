'use strict';

/**
 * shared/synapse-bridge.js
 *
 * Puente entre Brain ServerManager (TCP puerto fijo) y cualquier ventana
 * Electron del ecosistema Bloom. Compartido entre setup/ y workspace/.
 *
 * PROTOCOLO CORREGIDO:
 *   Brain ServerManager escucha en TCP 127.0.0.1:5678 (puerto FIJO).
 *   Wire format: [4 bytes UInt32 Big Endian = longitud][JSON payload UTF-8]
 *   Límite: 1 MB por mensaje (coincide con ServerManager).
 *
 *   El bridge se registra como Sentinel (REGISTER_CLI) al conectar y recibe
 *   todos los broadcasts del EventBus de Brain.
 *
 * SEÑAL DE HANDSHAKE COMPLETADO (por qué ya no usamos polling):
 *   Cuando Chrome Host se registra en Brain con REGISTER_HOST, Brain:
 *     1. Llama ProfileStateManager.set_profile_online() → escribe ONLINE en profiles.json
 *     2. Emite PROFILE_CONNECTED al EventBus
 *     3. Hace broadcast de PROFILE_CONNECTED a todos los Sentinels registrados
 *   El bridge recibe ese broadcast y lo clasifica como 'HANDSHAKE' para el renderer.
 *   Es una señal push — no hay polling de archivo, no hay race condition.
 *
 * CORRECCIONES RESPECTO A LA VERSIÓN ANTERIOR:
 *   1. Puerto: ephemeral port file (SynapseIPCServer, IonPump DOM) → puerto 5678 (ServerManager)
 *   2. Endianness: readUInt32LE → readUInt32BE (ServerManager usa Big Endian)
 *   3. Registro: se envía REGISTER_CLI al conectar para recibir broadcasts
 *   4. Clasificación: PROFILE_CONNECTED del perfil activo → tipo 'HANDSHAKE'
 *   5. Se eliminó toda la lógica de port file polling (era del servidor equivocado)
 *
 * USO MÍNIMO (setup):
 *   const { SynapseBridge } = require('../../shared/synapse-bridge');
 *   const bridge = new SynapseBridge({ mainWindow: win });
 *   const { profileId, launchId } = await bridge.seedAndLaunch('alias', { mode: 'discovery' });
 *   // Los eventos llegan al renderer via window.bloomSynapse.onEvent()
 *   bridge.destroy(); // en el close de la ventana
 *
 * USO MÍNIMO (workspace):
 *   const bridge = new SynapseBridge({ mainWindow: win });
 *   await bridge.launch('profile_uuid', { mode: 'landing' });
 *   bridge.destroy();
 */

const { spawn }        = require('child_process');
const net              = require('net');
const os               = require('os');
const path             = require('path');
const { EventEmitter } = require('events');

// ─── Canal IPC Electron (main → renderer) ────────────────────────────────────
// Debe coincidir exactamente con el que usa preload-synapse.js.
const SYNAPSE_IPC_CHANNEL = 'synapse:event';

// ─── Puerto fijo del ServerManager de Brain ──────────────────────────────────
const BRAIN_SERVER_PORT = 5678;

// ─── Timings ─────────────────────────────────────────────────────────────────
const TCP_INITIAL_DELAY_MS  = 1_500;   // pausa antes del primer intento (Brain necesita arrancar)
const TCP_RECONNECT_BASE_MS = 2_000;
const TCP_RECONNECT_MAX_MS  = 30_000;
const HEARTBEAT_WATCHDOG_MS = 20_000;  // si no llega nada en 20s → fase DEGRADED

// ─── Límite de mensaje ───────────────────────────────────────────────────────
// Debe coincidir con el límite de 1 MB que aplica ServerManager.
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

// ─── SynapseBridge ───────────────────────────────────────────────────────────

class SynapseBridge extends EventEmitter {
  /**
   * @param {object}                     opts
   * @param {Electron.BrowserWindow}     opts.mainWindow      Ventana cuyo renderer recibirá los eventos
   * @param {string}                    [opts.nucleusBinary]  Nombre o path del binario nucleus (default: 'nucleus')
   * @param {number}                    [opts.brainPort]      Puerto del ServerManager (default: 5678)
   * @param {string}                    [opts.bloomRoot]      Override del BloomRoot (útil en tests)
   * @param {boolean}                   [opts.verbose]        Log detallado en consola del main process
   */
  constructor({ mainWindow, nucleusBinary = 'nucleus', brainPort = BRAIN_SERVER_PORT, bloomRoot, verbose = false }) {
    super();

    this._win       = mainWindow;
    this._bin       = nucleusBinary;
    this._port      = brainPort;
    this._bloomRoot = bloomRoot || getBloomRoot();
    this._verbose   = verbose;

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
   * Cuándo usar esto:  el installer ya corrió `nucleus launch` y obtuvo un
   * `profile_id` / `launch_id`. No queremos relanzar el perfil; solo queremos
   * recibir el evento PROFILE_CONNECTED (handshake completado) que Brain emite
   * cuando Cortex hace REGISTER_HOST exitosamente.
   *
   * El bridge emite eventos al renderer via `window.bloomSynapse.onEvent()` y
   * también en el EventEmitter del main process via `bridge.on('synapse:event')`.
   *
   * @param {string}  profileId
   * @param {string}  [launchId=null]
   * @returns {this}  retorna la instancia para encadenamiento
   */
  connectToBrain(profileId, launchId = null) {
    this._profileId = profileId;
    this._launchId  = launchId;
    this._emit({ type: 'STATUS', phase: 'CONNECTING', message: 'Conectando a Brain ServerManager…' });
    // Usamos el mismo delay inicial que _doLaunch() para darle tiempo a Brain
    // de registrar el perfil antes de que intentemos conectar.
    this._reconnectTimer = setTimeout(() => this._connectTCP(), TCP_INITIAL_DELAY_MS);
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

    // Conectar a Brain ServerManager con delay inicial para que Brain
    // tenga tiempo de levantar si no estaba corriendo.
    this._reconnectTimer = setTimeout(() => this._connectTCP(), TCP_INITIAL_DELAY_MS);

    return { profileId: this._profileId, launchId: this._launchId };
  }

  /**
   * Ejecuta `nucleus --json synapse <args>` y retorna el objeto JSON parseado.
   * Rechaza si el proceso falla o si result.success === false.
   */
  _nucleus(args) {
    return new Promise((resolve, reject) => {
      const fullArgs = ['--json', 'synapse', ...args];
      this._log('→ nucleus', fullArgs.join(' '));

      const proc = spawn(this._bin, fullArgs);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', d => (stdout += d.toString()));
      proc.stderr.on('data', d => (stderr += d.toString()));

      proc.on('close', code => {
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

      proc.on('error', err =>
        reject(new Error(`No se pudo ejecutar nucleus: ${err.message}`))
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
   *
   * @param {object} payload  Objeto que será serializado a JSON.
   */
  _sendMsg(payload) {
    if (!this._socket || this._socket.destroyed) return;
    try {
      const body   = Buffer.from(JSON.stringify(payload), 'utf-8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length, 0);  // ← BigEndian, igual que ServerManager
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
      const msgLen = this._buf.readUInt32BE(0);  // ← BigEndian corregido (era LE)

      // Protección anti-corrupción: mismo límite que ServerManager (1 MB)
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

    const type = this._classifyMessage(msg);

    const enriched = {
      ...msg,
      type,
      _ts:        Date.now(),
      _profileId: this._profileId,
      _launchId:  this._launchId,
    };

    this._emit(enriched);
    this.emit('message', enriched);  // también disponible en el main process
  }

  /**
   * Clasifica un mensaje entrante de Brain en un tipo semántico para el renderer.
   *
   * Maneja dos formatos de mensajes posibles:
   *
   * Formato A — EventBus broadcast (emitido por ServerManager):
   *   { type: 'PROFILE_CONNECTED', timestamp: <ns>, data: { profile_id: '...' } }
   *   { type: 'PROFILE_DISCONNECTED', ... }
   *   { type: 'BRAIN_SERVICE_STATUS', ... }
   *   { type: 'REGISTER_ACK', conn_id: '...', role: 'cli' }
   *
   * Formato B — Chrome Native Messaging reenviado por Chrome Host:
   *   { command: 'HEARTBEAT', ... }
   *   { event: 'HANDSHAKE_CONFIRMED', ... }
   *   { event: 'HOST_READY', ... }
   *   { event: 'INTENT_STARTED', ... }
   */
  _classifyMessage(msg) {
    const msgType = (msg.type    || '').toUpperCase();
    const cmd     = (msg.command || '').toUpperCase();
    const event   = (msg.event   || '').toUpperCase();

    // ── Formato A: EventBus broadcasts ──────────────────────────────────────

    // PROFILE_CONNECTED del perfil activo = handshake de 3 fases completado.
    // Brain lo emite cuando Chrome Host hace REGISTER_HOST exitosamente,
    // justo después de llamar ProfileStateManager.set_profile_online().
    // Es la señal física más sólida: es push, no polling.
    if (msgType === 'PROFILE_CONNECTED') {
      const evProfileId = msg.data?.profile_id;
      // Si no trae profile_id o coincide con el nuestro → es nuestro handshake
      if (!evProfileId || evProfileId === this._profileId) {
        return 'HANDSHAKE';
      }
      return 'PROFILE';  // PROFILE_CONNECTED de otro perfil en el mismo server → pass-through
    }

    if (msgType === 'PROFILE_DISCONNECTED') return 'PROFILE';
    if (msgType === 'BRAIN_SERVICE_STATUS') return 'STATUS';

    // ACK de nuestro REGISTER_CLI: confirma que somos un Sentinel activo
    if (msgType === 'REGISTER_ACK')         return 'STATUS';

    // ── Formato B: Chrome Native Messaging (reenviado por Chrome Host) ──────
    if (cmd === 'HEARTBEAT' || event === 'HEARTBEAT') return 'HEARTBEAT';
    if (event === 'HANDSHAKE_CONFIRMED')              return 'HANDSHAKE';
    if (event === 'HOST_READY')                       return 'HOST_READY';
    if (event.startsWith('INTENT_'))                  return 'INTENT';
    if (event.startsWith('ION_'))                     return 'ION';
    if (event.startsWith('PROFILE_'))                 return 'PROFILE';

    // ── Fallback ─────────────────────────────────────────────────────────────
    if (msg.type) return msg.type;
    return 'SYNAPSE_EVENT';
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
    this.emit(SYNAPSE_IPC_CHANNEL, payload);
    try {
      if (this._win && !this._win.isDestroyed()) {
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

module.exports = { SynapseBridge, SYNAPSE_IPC_CHANNEL, getBloomRoot, BRAIN_SERVER_PORT };
