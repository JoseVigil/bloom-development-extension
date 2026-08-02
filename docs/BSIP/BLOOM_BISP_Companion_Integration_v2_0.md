# BLOOM — BISP Companion Integration v2.0

**Companion Cognitivo — Integración con el BISP**
Documento de Integración de Consumidor · Panel lateral Chromium (Bloom Cortex)
Sesión base: 29 de junio de 2026
Depende de: **BLOOM_BISP_Session_Decisions_v1_1.md** (no lo reemplaza ni lo modifica)

---

> **Regla de este documento:** Este documento describe cómo el Companion Cognitivo **consume** el BISP. No redefine el schema, el flujo Brain–Ollama–ChromaDB, ni los contratos genéricos de Synapse — todo eso vive en el documento base y sigue siendo válido sin que exista ninguna integración de Companion. Si necesitás tocar `index.json`, ChromaDB, Ollama o Mandates, ese trabajo no requiere leer este documento.

---

## Registro de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| v1.1 (histórico) | 2026-06-29 | Sección "Companion Cognitivo" incluida como parte del documento de sesión BISP v1.1, junto a decisiones genéricas del protocolo. |
| **v2.0** | 2026-06-29 | **Desacople.** Este contenido se extrae a un documento propio. Ya no contiene decisiones de schema, ChromaDB, Ollama o contratos genéricos de Synapse — esas viven exclusivamente en `BLOOM_BISP_Session_Decisions_v1_1.md`. Este documento asume ese protocolo como dado y solo describe la capa de consumo del Companion. |

---

## 0. Prerrequisitos — qué toma prestado del BISP core

El Companion es un **consumidor** del BISP, no un componente que participa en su generación. De `BLOOM_BISP_Session_Decisions_v1_1.md` toma:

- El **Contrato A (Continuar)** de Synapse (sección 2.5 del documento base), que extiende con restricciones propias (ver sección 3).
- Los campos `operational.intent_type`, `operational.objective` y `autarchic.findings_summary` / `domain_tags` del `index.json` (sección 4 del documento base), como insumo de contexto.

> **Nota de brecha abierta:** el flujo de implementación de este documento referencia un campo `bisp.openDecision` que **no existe** en el schema `index.json` documentado en el BISP core. Antes de implementar la sección 4 de este documento, esa brecha debe resolverse en el documento base (agregar el campo al schema, o reemplazar la referencia por un campo existente). Este documento no asume una resolución para no invadir decisiones que corresponden al BISP core.

El Companion **no** participa en la generación de vectores, no llama a Ollama ni a ChromaDB, y no tiene acceso directo a Brain. Consume el package ya cerrado.

---

## 1. Filosofía de integración

El Companion Cognitivo (panel lateral Chromium) se integra al pipeline BISP como un **observador de sesión con contexto nativo**. A diferencia de la integración vía botón "Brief" (pull manual), la integración BISP es un push automático que ocurre antes de que el ingeniero interactúe con la UI de la AI web.

El principio rector es la **Sesión Prístina**: la sesión de la AI web (Claude, ChatGPT, Grok) permanece libre de ruido de control. El Companion absorbe toda la carga cognitiva de validación y la mantiene disponible en su panel lateral, respondiendo solo cuando el ingeniero lo consulta.

## 2. Principio de Sesión Prístina

**Definición:** Una sesión prístina es aquella donde el chat de la AI web contiene exclusivamente la conversación técnica entre el ingeniero y el modelo. Sin preguntas de control de contexto, sin verificaciones de consistencia con el BISP, sin ruido de gobernanza.

**Por qué importa:** El ingeniero que pregunta en el chat de Claude "¿esto es compatible con la decisión de arquitectura v1.0?" está ensuciando la sesión con un problema que el Companion puede resolver en paralelo. El historial de Claude queda contaminado con metadata de gobernanza que no aporta a la generación de solución.

**Cómo se garantiza:** El Companion recibe el BISP completo como carga silenciosa antes de que la sesión comience. Actúa como Shadow Monitor: tiene todo el contexto, no lo expresa hasta ser consultado.

## 3. Contrato de Synapse aplicado al Companion (extensión del Contrato A)

El BISP core define el **Contrato A — Continuar** como uso genérico para cualquier AI web en flujo activo (ver documento base, sección 2.5). El Companion se acoge a ese contrato y le agrega restricciones propias, específicas de su rol de panel lateral:

```
Contrato A — Informativo de Fondo (Companion Web)
Extiende: Contrato A del BISP core (Continuar)

- La carga del BISP vía Synapse al Companion es de carácter INFORMATIVO DE FONDO.
- El Companion actúa como Shadow Monitor (Monitor en la Sombra).
- Prohibido: renderizado proactivo de warnings, pop-ups, titileos, o cualquier
  interrupción visual que altere el flujo libre de la sesión de AI principal.
- Si detecta divergencias entre la respuesta de la AI web y el BISP, las
  almacena en su contexto local. Las expone solo bajo consulta explícita.
- El ingeniero siempre tiene control: el Companion prepara, él decide cuándo consultar.
```

Estas restricciones son propias del Companion. No modifican el Contrato A genérico para otros consumidores.

## 4. Flujo de implementación

**Trigger — Detección de UI Claude en background.js**

```javascript
// background.js — push automático del BISP al Companion
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const AI_WEB_URLS = ['claude.ai', 'chat.openai.com', 'grok.com'];
  const isAIWeb = AI_WEB_URLS.some(url => tab.url?.includes(url));

  if (changeInfo.status === 'complete' && isAIWeb) {
    const bisp = _lastCortexBrief;
    if (bisp) {
      chrome.runtime.sendMessage({
        type: 'INJECT_BISP',
        brief: bisp,
        systemPrompt: buildCompanionPromptForSession(bisp),
        autoSend: true   // bootstrap silencioso: el system prompt se inyecta automáticamente
      });
    }
  }
});
```

**System prompt dinámico por sesión**

```javascript
function buildCompanionPromptForSession(bisp) {
  return `
Sos el Companion Cognitivo de Cognituum asistiendo en una sesión lateral.
El ingeniero está interactuando con una AI web bajo el siguiente contexto BISP:

- Intent: ${bisp.intentType} — ${bisp.summary}
- Estado: ${bisp.openDecision
    ? `Decisión abierta: ${bisp.openDecision}`
    : 'Sin decisiones abiertas.'}

REGLA DE ORO — SESIÓN PRÍSTINA:
1. Tu rol es PASIVO y REACTIVO. No interrumpas el flujo principal ni generes
   outputs sin que el ingeniero te consulte directamente en este panel.
2. Si identificás divergencias entre lo que propone la AI web y el BISP,
   registralas en tu contexto. No las verbalizás hasta ser consultado.
3. Cuando el ingeniero te consulte, respondé con frialdad técnica: análisis
   de consistencia con el BISP, sin juicio sobre las decisiones de la AI web.
4. Tu objetivo es que el chat de la AI web permanezca prístino: solo
   conversación técnica de solución, sin ruido de gobernanza.

Esperá la consulta del ingeniero.
  `.trim();
}
```

> Nota: `bisp.intentType`, `bisp.summary` y `bisp.openDecision` son campos consumidos por esta función. Los dos primeros mapean a `operational.intent_type` y `operational.objective` del schema base. `openDecision` es la brecha señalada en la sección 0 — no tiene mapeo confirmado en el schema `index.json` actual.

## 5. Nuevo tipo de mensaje: INJECT_BISP

El mensaje existente `INJECT_BRIEF` se extiende con `INJECT_BISP` para diferenciar la carga manual (botón Brief) de la carga automática de sesión:

| Mensaje | Trigger | autoSend | Comportamiento |
|---|---|---|---|
| `INJECT_BRIEF` | Botón "Brief" del toolbar | false | El ingeniero ve el brief y decide si enviarlo. Carga manual explícita. |
| `INJECT_TEXT` | Cortex vía API | configurable | Inyección de texto libre. |
| `INJECT_BISP` | Detección de AI web en tab | true (system prompt) | Carga silenciosa del BISP completo con system prompt dinámico. El ingeniero no ve la inyección — el Companion queda listo en background. |
| `NEW_SESSION` | Botón "Reset" del toolbar | true (system prompt) | Recarga el webview y re-inyecta el system prompt. |

## 6. Estado SILENT_MONITORING

Post-inyección BISP, el Companion entra en estado `SILENT_MONITORING`. En este estado:

- El statusbar del panel muestra: `● Sesión activa — BISP cargado`
- No hay ningún output visible en el chat del webview (Gemini)
- El Companion tiene el BISP completo en contexto y el system prompt activo
- Al primer mensaje del ingeniero en el panel, el Companion responde con contexto completo

## 7. Fase 2 — Monitoreo activo opt-in (roadmap)

La Fase 1 implementa el Monitoreo Silencioso descrito en las secciones 4–6.

La Fase 2, opt-in y post-validación de UX, agrega monitoreo activo cuando el BISP tiene `openDecision` presente:

- Si el ingeniero acepta explícitamente activar el modo activo para esa sesión
- El Companion puede emitir un único aviso discreto en su panel (nunca en el chat de Claude) si detecta que la respuesta de la AI web no aborda la decisión abierta
- El aviso no interrumpe el flujo: es un indicador en el statusbar del panel, no un pop-up

La Fase 2 no se implementa hasta que la Fase 1 esté validada en uso real.

---

## 8. Impacto en archivos existentes (específico de Companion)

| Archivo / Componente | Estado | Acción requerida |
|---|---|---|
| `background.js` (Companion) | Extender | Agregar trigger de detección de UI Claude. Lógica de push automático del BISP al Companion con system prompt dinámico. Ver sección 4. |
| `panel.js` (Companion) | Extender | Soporte para `INJECT_BISP` con system prompt embebido. Estado `SILENT_MONITORING` post-inyección. Ver secciones 5–6. |

> Cambios al schema `index.json`, a Brain, ChromaDB u Ollama **no** se documentan acá — están fuera del alcance de este documento. Ver `BLOOM_BISP_Session_Decisions_v1_1.md`.

---

## 9. Invariantes de Diseño — Companion

Estas invariantes son propias del Companion y se suman a las invariantes 1–5 del BISP core (documento base, sección 7), sin reemplazarlas.

**Invariante C1 — El Companion no interrumpe el flujo principal**
El Companion Cognitivo opera bajo el Principio de Sesión Prístina. Recibe el BISP como carga de fondo pero nunca emite outputs proactivos durante una sesión activa con una AI web. La interrupción proactiva del flujo principal es una violación de diseño, no una feature.

**Invariante C2 — INJECT_BISP es siempre silencioso**
La carga del BISP al Companion vía `INJECT_BISP` nunca produce output visible en el webview. El ingeniero no debe percibir la inyección. Si la inyección falla, el Companion opera sin contexto BISP y lo indica en el statusbar. La sesión de la AI web no se ve afectada en ningún caso.

**Invariante C3 — El system prompt del Companion es versionado junto al BISP**
El `buildCompanionPromptForSession()` es parte del contrato de consumo del Companion, no una constante libre. Cualquier cambio en su comportamiento es un cambio de versión de este documento, no del BISP core.

---

*BLOOM — BISP Companion Integration Document · v2.0 · Junio 2026*
*Este documento describe exclusivamente la integración del Companion Cognitivo con el BISP. Las decisiones de protocolo (schema, ChromaDB, Ollama, contratos genéricos de Synapse) viven en BLOOM_BISP_Session_Decisions_v1_1.md y no se duplican aquí.*
