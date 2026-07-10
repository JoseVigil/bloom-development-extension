// ============================================================================
// COMPANION PROTOCOL v2.0.0 — Manifiesto de mensajes del Orquestador Cognituum
//
// Salto de versión (1.2.0 -> 2.0.0) porque el CONTRATO cambió de forma, no
// solo de contenido: v1.2 modelaba un solo vínculo simétrico
// (brain <-> companion, hablándole directo a un <webview> embebido — modelo
// "Contenedor", descartado en Meta 0 de la auditoría por inviabilidad
// técnica). v2.0.0 modela tres roles con dos vínculos de confianza distinta:
//
//   Side Panel (Bloom UI) ---- commands ----> background.js (Orquestador)
//   Side Panel (Bloom UI) <--- reports  ----- background.js (Orquestador)
//   background.js         <--- engineChannel  Tab de Cognituum (Gemini)
//
// El primer vínculo es interno y confiable (extensión-a-extensión). El
// segundo es frágil por naturaleza: depende del DOM de una página externa
// real que puede cerrarse, navegar, o cambiar de estructura sin aviso — por
// eso vive documentado acá aparte, no mezclado con `commands`/`reports`
// como si tuviera las mismas garantías.
//
// NOTA DE ALCANCE — qué NO incluye este manifiesto:
//   - Nada de CAPTURE_TAB_SCREENSHOT / captureAndSendScreenshot (heredado de
//     la nota de alcance de v1.2.0 — sigue sin agregarse).
//   - INJECT_BISP / INJECT_BRIEF / INJECT_TEXT / NEW_SESSION / SLAVE_MODE_CHANGED
//     (v1.2.0) NO están acá: eran mensajes para hablarle directo a un webview
//     embebido que ya no existe en este modelo. Ver companionProtocolLegacy
//     más abajo si hace falta el historial, pero no se deben emitir/escuchar.
// ============================================================================

const COMPANION_PROTOCOL = {
  asset: 'companion',
  version: '2.0.0',
  paradigm: 'orchestrator', // 'container' (v1.2.0, deprecado) -> 'orchestrator'

  // --------------------------------------------------------------------
  // Side Panel -> background.js
  // Canal interno, confiable. El Side Panel nunca sabe si el motor está
  // despierto, ocupado o caído — solo emite el comando y escucha `reports`.
  // --------------------------------------------------------------------
  commands: {
    COMMAND_RUN_BISP: {
      direction: 'sidepanel -> background',
      payloadSchemaRef: 'protocols/companion.schema.json#/definitions/bisp',
      requiresMandateId: true,
    },
    COMMAND_RUN_BRIEF: {
      direction: 'sidepanel -> background',
      payloadSchemaRef: 'protocols/companion.schema.json#/definitions/brief',
      requiresMandateId: true,
    },
    COMMAND_RUN_FREETEXT: {
      direction: 'sidepanel -> background',
      payloadSchemaRef: 'protocols/companion.schema.json#/definitions/freeText',
      requiresMandateId: true,
    },
    COMMAND_REOPEN_ENGINE: {
      direction: 'sidepanel -> background',
      payloadSchemaRef: null,
      requiresMandateId: false,
      // Emitido por el botón ">>" del Side Panel cuando el motor está
      // SLEEPING o DISCONNECTED.
    },
  },

  // --------------------------------------------------------------------
  // background.js -> Side Panel
  // Reportes de estado + resultado ya filtrado ("sabiduría decantada",
  // no el BISP/brief crudo). El Technical Log del Expander se arma en el
  // propio Side Panel a partir de lo que el usuario mandó, no de un mensaje
  // separado — background.js no reenvía el payload crudo por este canal.
  // --------------------------------------------------------------------
  reports: {
    ENGINE_STATUS_CHANGED: {
      direction: 'background -> sidepanel',
      payload: {
        status: ['SLEEPING', 'WAKING', 'READY', 'BUSY', 'DISCONNECTED'],
      },
    },
    REPORT_RESULT: {
      direction: 'background -> sidepanel',
      payload: ['mandateId', 'commandId', 'cleanResponse', 'timestamp'],
    },
    REPORT_ERROR: {
      direction: 'background -> sidepanel',
      payload: {
        fields: ['mandateId', 'commandId', 'reason'],
        knownReasons: ['ENGINE_TIMEOUT', 'INJECTION_FAILED', 'INPUT_NOT_FOUND'],
      },
    },
  },

  // --------------------------------------------------------------------
  // background.js <-> Tab de Cognituum (Gemini)
  // NO es tráfico extensión-a-extensión clásico: el lado "Tab de Cognituum"
  // es una función inyectada vía chrome.scripting.executeScript corriendo
  // en el DOM de gemini.google.com, no un asset con su propio protocolo.js.
  // Se documenta acá para que el contrato completo quede en un solo lugar,
  // marcado como de confianza distinta al resto.
  // --------------------------------------------------------------------
  engineChannel: {
    trust: 'untrusted-dom', // depende de la estructura real de una página externa
    ENGINE_RESPONSE_CAPTURED: {
      direction: 'injected-script -> background',
      payload: ['commandId', 'mandateId', 'rawText'],
    },
    ENGINE_INJECTION_FAILED: {
      direction: 'injected-script -> background',
      payload: {
        fields: ['commandId', 'mandateId', 'reason'],
        knownReasons: ['INPUT_NOT_FOUND'],
      },
    },
  },
};

// ============================================================================
// LEGACY (v1.2.0) — referencia histórica únicamente, no usar.
// Mantenido acá comentado, no como objeto activo, para que quede trazable
// qué mensajes existían antes por si algún código viejo todavía los emite
// durante la migración.
// ============================================================================
//
// const COMPANION_PROTOCOL_V1 = {
//   messages: {
//     INJECT_BISP:  { direction: 'brain -> companion', requiresHandshake: true },
//     INJECT_BRIEF: { direction: 'brain -> companion', requiresHandshake: true },
//     INJECT_TEXT:  { direction: 'brain -> companion', requiresHandshake: true },
//     NEW_SESSION:  { direction: 'brain -> companion', requiresHandshake: true },
//     SLAVE_MODE_CHANGED: { direction: 'companion -> brain', requiresHandshake: true },
//   },
// };

// ============================================================================
// EXPORT (mismo patrón que landingProtocol.js / discoveryProtocol.js)
// ============================================================================
if (typeof window !== 'undefined') {
  window.COMPANION_PROTOCOL = COMPANION_PROTOCOL;
  console.log('[CompanionProtocol] ⚙️ Loaded v2.0.0 (orchestrator) at:', new Date().toISOString());
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = COMPANION_PROTOCOL;
}
