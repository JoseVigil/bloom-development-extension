// ============================================================================
// GITHUB APP DEVICE FLOW — módulo para background.js (service worker, MV3)
// Ver HANDOFF-github-app-batcave-synapse.md §3 y §5.3.
//
// ⚠️ NO TENGO tu background.js real todavía (no estaba entre los archivos
// subidos — el propio HANDOFF lo lista como pendiente en §6). Este archivo
// es un módulo autocontenido, pensado para pegarse dentro de tu background.js
// existente. Los tres puntos marcados "INTEGRACIÓN REQUERIDA" abajo dependen
// de código que no puedo ver (tu router de mensajes existente y tu mecanismo
// real de Native Messaging hacia el host) — están resueltos con la mejor
// suposición consistente con lo que sí veo en discovery.js/discoveryProtocol.js,
// pero necesitan que los revises contra el archivo real.
//
// Contrato de mensajes con discovery.js (GithubAppAuthFlow):
//   discovery.js → acá : { action: 'startGithubDeviceFlow' }
//   discovery.js → acá : { action: 'cancelGithubDeviceFlow' }
//   acá → discovery.js : { event: 'GITHUB_DEVICE_CODE', user_code, verification_uri, expires_in }
//   acá → discovery.js : { event: 'GITHUB_APP_AUTHORIZED', username, token_fingerprint, scopes, profile_id, launch_id, timestamp }
//   acá → discovery.js : { event: 'GITHUB_DEVICE_FLOW_ERROR', reason }
// ============================================================================

// ── INTEGRACIÓN REQUERIDA #1 ──────────────────────────────────────────────
// Client ID de la GitHub App registrada. El HANDOFF (§3) da por hecho que la
// app ya está registrada pero no deja el client_id en ningún documento que
// tenga — completalo acá.
const GITHUB_APP_CLIENT_ID = 'TODO_GITHUB_APP_CLIENT_ID';

// Scopes finales acordados en HANDOFF §3.4. El Device Flow de una GitHub App
// (a diferencia de una OAuth App clásica) no usa el parámetro `scope` en el
// request — los permisos ya están fijados en el registro de la app (Members:
// read-only, Contents: read&write, Administration: read&write, read:user).
// Se deja la constante solo para loguearla en el evento de éxito.
const GITHUB_APP_SCOPES_LABEL = 'contents:write,administration:write,members:read';

const DEVICE_CODE_URL  = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_API_URL     = 'https://api.github.com/user';

const STORAGE_KEY  = 'github_device_flow_state';
const ALARM_NAME    = 'github_device_flow_poll';

// ── SHA-256 primeros 8 chars — mismo esquema de fingerprint que
// GithubAuthFlow.sha256Prefix() en discovery.js, para que los fingerprints
// se vean consistentes en toda la UI aunque ahora los calcule background.js.
async function sha256Prefix(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.substring(0, 8);
}

// ── INTEGRACIÓN REQUERIDA #2 ──────────────────────────────────────────────
// Enviar un mensaje a la tab de Discovery. Asumo que ya existe algo así en tu
// background.js (se usa para GITHUB_PAT_DETECTED, GOOGLE_LOGIN_DETECTED,
// API_KEY_REGISTERED, etc. — todos "acá → discovery.js"). Si tu función real
// tiene otro nombre/firma, reemplazá las llamadas a notifyDiscovery() por la
// tuya. chrome.runtime.sendMessage sin tabId funciona si discovery.js está
// escuchando vía chrome.runtime.onMessage (que es como está armado hoy), pero
// si tenés multi-tab necesitás chrome.tabs.sendMessage(tabId, ...) en su lugar.
function notifyDiscovery(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // No hay listener activo (tab de discovery cerrada) — no es un error real.
  });
}

// ── INTEGRACIÓN REQUERIDA #3 ──────────────────────────────────────────────
// Reenviar el token real al host (Brain/Nucleus) por Native Messaging. Este
// es el único lugar donde el access token completo existe fuera de la
// respuesta HTTP de GitHub — nunca se manda a discovery.js ni se guarda en
// chrome.storage más tiempo del necesario para el polling (ver
// clearDeviceFlowState() en el flujo de éxito).
//
// No tengo tu implementación real del native port (nombre del host nativo
// registrado, si usás connectNative persistente o sendNativeMessage puntual,
// etc.). Dejo un stub con la forma más común (connectNative + postMessage) —
// reemplazalo por tu mecanismo real antes de mergear.
function forwardTokenToHost({ token, username, scopes, profile_id, launch_id }) {
  try {
    const port = chrome.runtime.connectNative('com.bloom.host'); // TODO: nombre real del host nativo
    port.postMessage({
      type: 'GITHUB_APP_TOKEN',
      token,             // el token completo — única vez que sale de este service worker
      username,
      scopes,
      profile_id,
      launch_id,
      timestamp: Date.now()
    });
    port.disconnect();
  } catch (e) {
    console.error('[GithubDeviceFlow] No se pudo reenviar el token al host:', e.message);
    // Si esto falla, GITHUB_APP_AUTHORIZED igual se manda a discovery.js más
    // abajo — el usuario ve éxito en la UI aunque el host no haya recibido el
    // token. Vale la pena decidir si esto debería bloquear el evento de éxito
    // en vez de degradar silenciosamente; lo dejo así por ahora porque no sé
    // cómo tu host reporta reconexión/reintento.
  }
}

// ============================================================================
// PASO 1 — pedir el device code
// ============================================================================
async function startGithubDeviceFlow() {
  console.log('[GithubDeviceFlow] Requesting device code');

  try {
    const resp = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new URLSearchParams({ client_id: GITHUB_APP_CLIENT_ID })
    });

    if (!resp.ok) {
      console.error('[GithubDeviceFlow] device/code request failed:', resp.status);
      notifyDiscovery({ event: 'GITHUB_DEVICE_FLOW_ERROR', reason: 'denied' });
      return;
    }

    const data = await resp.json();
    // data: { device_code, user_code, verification_uri, expires_in, interval }

    const expiresAt = Date.now() + (data.expires_in * 1000);

    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        device_code: data.device_code,
        interval:    data.interval || 5,
        expires_at:  expiresAt,
        profile_id:  self.SYNAPSE_CONFIG?.profileId ?? null,
        launch_id:   self.SYNAPSE_CONFIG?.launchId ?? null
      }
    });

    notifyDiscovery({
      event:            'GITHUB_DEVICE_CODE',
      user_code:        data.user_code,
      verification_uri: data.verification_uri,
      expires_in:       data.expires_in
    });

    schedulePolling(data.interval || 5);
  } catch (e) {
    console.error('[GithubDeviceFlow] Exception requesting device code:', e.message);
    notifyDiscovery({ event: 'GITHUB_DEVICE_FLOW_ERROR', reason: 'denied' });
  }
}

// ============================================================================
// PASO 2 — polling vía chrome.alarms
// El service worker de MV3 no es persistente (se mata a los ~30s de
// inactividad, ver HANDOFF §3) — por eso NO se puede usar setInterval acá.
// chrome.alarms sobrevive a que el worker se duerma/reinicie porque Chrome
// lo re-despierta en cada tick para disparar el evento.
//
// Chrome fuerza un mínimo de 1 minuto entre alarms para extensiones
// empaquetadas — más lento que los 5s que recomienda GitHub, pero el
// protocolo de Device Flow permite pollear a un intervalo IGUAL O MAYOR al
// que devuelve `interval`, así que 60s es válido, solo más lento.
// ============================================================================
function schedulePolling(intervalSeconds) {
  const periodInMinutes = Math.max(1, Math.ceil(intervalSeconds / 60));
  chrome.alarms.create(ALARM_NAME, { periodInMinutes });
  console.log('[GithubDeviceFlow] Polling scheduled every', periodInMinutes, 'min (GitHub pidió', intervalSeconds, 's)');
}

async function clearDeviceFlowState() {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.storage.local.remove(STORAGE_KEY);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await pollAccessToken();
});

async function pollAccessToken() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const state = result[STORAGE_KEY];
  if (!state) {
    // Estado perdido (cancelado o ya resuelto) — no debería seguir pollenado.
    await chrome.alarms.clear(ALARM_NAME);
    return;
  }

  if (Date.now() > state.expires_at) {
    console.warn('[GithubDeviceFlow] Device code expired');
    await clearDeviceFlowState();
    notifyDiscovery({ event: 'GITHUB_DEVICE_FLOW_ERROR', reason: 'expired_token' });
    return;
  }

  try {
    const resp = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new URLSearchParams({
        client_id:   GITHUB_APP_CLIENT_ID,
        device_code: state.device_code,
        grant_type:  'urn:ietf:params:oauth:grant-type:device_code'
      })
    });

    const data = await resp.json();

    if (data.access_token) {
      await clearDeviceFlowState();
      await handleAuthorized(data.access_token, state);
      return;
    }

    switch (data.error) {
      case 'authorization_pending':
        // Todavía nadie aprobó el código — seguir pollenado sin tocar nada.
        return;

      case 'slow_down':
        // GitHub pide bajar la frecuencia. Reprogramamos con el nuevo
        // interval (viene en data.interval, +5s típicamente).
        await chrome.alarms.clear(ALARM_NAME);
        schedulePolling((data.interval || state.interval + 5));
        return;

      case 'expired_token':
        await clearDeviceFlowState();
        notifyDiscovery({ event: 'GITHUB_DEVICE_FLOW_ERROR', reason: 'expired_token' });
        return;

      case 'access_denied':
        await clearDeviceFlowState();
        notifyDiscovery({ event: 'GITHUB_DEVICE_FLOW_ERROR', reason: 'access_denied' });
        return;

      default:
        console.error('[GithubDeviceFlow] Unexpected error from access_token endpoint:', data.error);
        await clearDeviceFlowState();
        notifyDiscovery({ event: 'GITHUB_DEVICE_FLOW_ERROR', reason: 'denied' });
        return;
    }
  } catch (e) {
    console.error('[GithubDeviceFlow] Exception polling access_token:', e.message);
    // Fallo de red puntual — no cancelamos el flujo, dejamos que el próximo
    // tick de la alarm reintente. Si expira mientras tanto, el check de
    // expires_at de arriba lo va a atajar.
  }
}

// ============================================================================
// PASO 3 — autorizado: resolver usuario, fingerprint, avisar a discovery.js
// y reenviar el token real al host.
// ============================================================================
async function handleAuthorized(token, state) {
  console.log('[GithubDeviceFlow] Access token received');

  let username = null;
  try {
    const resp = await fetch(USER_API_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    });
    if (resp.ok) {
      const user = await resp.json();
      username = user.login;
    }
  } catch (e) {
    console.warn('[GithubDeviceFlow] Could not resolve username (non-fatal):', e.message);
  }

  const fingerprint = await sha256Prefix(token);

  // El token completo sale del service worker acá y en ningún otro lado.
  forwardTokenToHost({
    token,
    username,
    scopes:     GITHUB_APP_SCOPES_LABEL,
    profile_id: state.profile_id,
    launch_id:  state.launch_id
  });

  notifyDiscovery({
    event:             'GITHUB_APP_AUTHORIZED',
    username:          username || '',
    token_fingerprint: fingerprint,
    scopes:            GITHUB_APP_SCOPES_LABEL,
    profile_id:        state.profile_id,
    launch_id:         state.launch_id,
    timestamp:         Date.now()
  });

  console.log('[GithubDeviceFlow] GITHUB_APP_AUTHORIZED emitido — user:', username || '(sin resolver)');
}

async function cancelGithubDeviceFlow() {
  console.log('[GithubDeviceFlow] Cancelled by user');
  await clearDeviceFlowState();
}

// ============================================================================
// LISTENER — mensajes desde discovery.js (GithubAppAuthFlow)
//
// INTEGRACIÓN REQUERIDA: si tu background.js ya tiene un
// chrome.runtime.onMessage.addListener central que rutea por msg.action,
// agregá estos dos cases ahí en vez de registrar un listener nuevo acá
// (múltiples listeners funcionan, pero es más fácil de mantener con uno solo).
// ============================================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startGithubDeviceFlow') {
    startGithubDeviceFlow();
    return false;
  }
  if (msg.action === 'cancelGithubDeviceFlow') {
    cancelGithubDeviceFlow();
    return false;
  }
});
