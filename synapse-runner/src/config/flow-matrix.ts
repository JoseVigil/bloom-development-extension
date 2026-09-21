/**
 * Esquema local de la Matriz de Flujo completa (Fase 0 server-side + Fases
 * 1-4 local), tal como la consolida
 * `docs/SYNAPSE/SYNAPSE-RUNNER/Synapse_Runner_Requerimiento_Integrado_v1_0.md`
 * §6 (que a su vez renumera la Matriz de Flujo original del dossier de
 * arquitectura, §3 en ese documento).
 *
 * Este archivo es la representación tipada/consultable de esa matriz — el
 * "esquema local" que el resto del Runner (specs, correlator, reportes) usa
 * para saber qué pasos existen, en qué fase/superficie viven, y si este
 * Runner los implementa hoy. Antes de esta actualización, el esquema
 * asumía implícitamente que el flujo arrancaba en "01. Launch" — este
 * archivo es la corrección: agrega los 4 pasos server-side previos
 * (00a-00d) que preceden a Electron.
 *
 * ACTUALIZACIÓN 2026-09-20: 00a y 00b YA ESTÁN IMPLEMENTADOS — dejaron de
 * ser stub. La Sección 14.1 (¿aplica AUTHORITY_BOUNDARY.md §1 a un arnés de
 * Playwright automatizando login/registro GitHub?) no se resolvió eligiendo
 * una de las dos opciones que dejaba abiertas — se esquivó por completo
 * replicando el patrón del Synapse Simulator del lado del backend: un modo
 * fixture HTTP (`AUTHORITY_ALLOW_TEST_FIXTURES`, sólo dev, nunca en un
 * despliegue real) que inyecta el estado interno post-login directamente,
 * sin navegar nunca a github.com. Ver el comentario completo en
 * `src/surfaces/phase0-generic-browser.ts` (que, pese al nombre heredado,
 * ya no usa Playwright ni ningún browser para 00a/00b — son dos llamadas
 * HTTP puras).
 *
 * 00c y 00d siguen en `implementedInRunner: false`, pero por motivos
 * DISTINTOS y no relacionados con AUTHORITY_BOUNDARY.md — ver sus `notes`
 * individuales abajo y el comentario de `executePhase0Download()` en
 * `phase0-generic-browser.ts`.
 *
 * ACTUALIZACIÓN 2026-09-21: nuevo step `backend_identity_check`, incorporado
 * por `Encargo_Modificacion_Runner_Incorporacion_Step_BackendIdentityCheck_v1_0.md`
 * (Project BTIPS). Es el step 0 del wizard LOCAL de Conductor (Auth 1, solo
 * identidad) — NO es lo mismo que 00a/00b (Fase 0 SERVER-SIDE, HTTP puro):
 * este corre DENTRO de Electron, después de `launchConductor()`, y antes de
 * "01. Launch" (que ahora queda gateado por él — ver la nota del step '01').
 * José ya lo implementó del lado cliente de Conductor; acá solo se
 * incorpora al esquema y se completa vía inyección del Synapse Simulator
 * mientras el backend real de identidad no exista — ver
 * `src/surfaces/backend-identity-check.ts`.
 */

export type FlowPhase = 'fase0-server' | 'fase1-4-local';

export type FlowSurface =
  | 'superficie-0-browser-generico' // 00a/00b implementados (HTTP fixture, sin browser); 00c/00d stub — ver phase0-generic-browser.ts
  | 'superficie-1-electron-conductor'
  | 'superficie-2-chromium-discovery'
  | 'superficie-3-companion-side-panel'
  | 'superficie-4-cli-contingencia';

export type FlowStepStatus =
  | 'construido' // ✅ en el documento fuente
  | 'construido_alcance_limitado' // ✅ pero con caveat (ej. 00c, sin descubrimiento público de releaseId)
  | 'construido_selectores_sin_verificar' // ✅ ⚠️ (ej. paso 10, Gemini)
  | 'pending_feature_en_diseno'; // 🚧 (ej. paso 06, Submit Simulator UI-driven)

export interface FlowStep {
  id: string;
  phase: FlowPhase;
  surface: FlowSurface;
  actorOrSurface: string;
  humanActionSimulated: string;
  eventGenerated: string;
  receiverOrWaitMechanism: string;
  status: FlowStepStatus;
  /** ¿Este Runner ejecuta este paso hoy? false para 00a-00d (stub) y para 06 (Submit Simulator, pendiente). */
  implementedInRunner: boolean;
  /** Referencia a la frontera externa que cruza este paso, si corresponde — ver EXTERNAL_BOUNDARIES abajo. */
  externalBoundaryId?: number;
  notes?: string;
}

export const FLOW_MATRIX: FlowStep[] = [
  {
    id: '00a',
    phase: 'fase0-server',
    surface: 'superficie-0-browser-generico',
    actorOrSurface: 'Browser genérico (sin Cortex)',
    humanActionSimulated: 'Iniciar login/registro GitHub contra el backend',
    eventGenerated: 'POST/GET /v1/authority/genesis/login',
    receiverOrWaitMechanism: 'Backend crea organización + identidad atómicamente',
    status: 'construido',
    implementedInRunner: true,
    externalBoundaryId: 1,
    notes:
      'Registro y login son el mismo evento — no hay alta separada (genesis-store.ts). Implementado como HTTP puro ' +
      '(sin browser) vía runPhase0FixtureRegistration()/beginPhase0FixtureRegistration() en ' +
      'phase0-generic-browser.ts, contra el backend en modo AUTHORITY_ALLOW_TEST_FIXTURES=true — nunca navega a ' +
      'github.com, la frontera #1 nunca se cruza de verdad (se esquiva por inyección de fixture).',
  },
  {
    id: '00b',
    phase: 'fase0-server',
    surface: 'superficie-0-browser-generico',
    actorOrSurface: 'GitHub (frontera externa #1)',
    humanActionSimulated: 'Autorizar la GitHub App del backend',
    eventGenerated: 'GET /v1/authority/human/callback',
    receiverOrWaitMechanism: "Backend emite sesión (__Host-authority-session)",
    status: 'construido',
    implementedInRunner: true,
    externalBoundaryId: 1,
    notes:
      'Implementado como HTTP puro (sin browser) vía finishPhase0FixtureRegistration() en ' +
      'phase0-generic-browser.ts — mismo mecanismo de inyección de fixture que 00a, misma frontera esquivada.',
  },
  {
    id: '00c',
    phase: 'fase0-server',
    surface: 'superficie-0-browser-generico',
    actorOrSurface: 'Browser genérico',
    humanActionSimulated: 'Descargar el binario del instalador',
    eventGenerated: 'GET /v1/releases/:releaseId/download',
    receiverOrWaitMechanism: 'R2 sirve el objeto directo',
    status: 'construido_alcance_limitado',
    implementedInRunner: false,
    notes:
      'Bloqueo DISTINTO al de 00a/00b (no es AUTHORITY_BOUNDARY.md): sin ruta de descubrimiento público de ' +
      'releaseId para un humano anónimo — ver §11/§13 del Requerimiento Integrado y executePhase0Download() ' +
      'en phase0-generic-browser.ts.',
  },
  {
    id: '00d',
    phase: 'fase0-server',
    surface: 'superficie-0-browser-generico',
    actorOrSurface: 'Sistema operativo del usuario',
    humanActionSimulated: "Ejecutar instalador, luego 'nucleus init' manual, luego 'sync'",
    eventGenerated:
      'Registro de instalación → trust manifest → tenant lookup → reconciliación .ownership.json',
    receiverOrWaitMechanism: 'Backend + filesystem local',
    status: 'construido',
    implementedInRunner: false,
    notes: 'Pasos manuales, no automáticos, incluso en el flujo real (authority_command.go).',
  },
  {
    // Encargo_Modificacion_Runner_Incorporacion_Step_BackendIdentityCheck_v1_0.md
    // (2026-09-21, Project BTIPS) — step 0 del wizard LOCAL de Conductor
    // (Auth 1, solo identidad). NO confundir con 00a/00b de arriba (Fase 0
    // SERVER-SIDE, HTTP puro sin Electron) — este step vive DENTRO de
    // Electron, vía IPC. Contrato confirmado por lectura directa del código
    // real de Conductor (milestone-registry.js, milestone-reactor.js,
    // preload_onboarding.js, ipc/onboarding-handlers.js,
    // step-backend-identity.js, onboarding.html) — no del documento de
    // diseño solamente. El backend real de identidad no existe todavía
    // (evento Cortex 'IDENTITY_VALIDATED' es provisorio) — se completa por
    // inyección directa del Synapse Simulator, ver
    // src/surfaces/backend-identity-check.ts.
    id: 'backend_identity_check',
    phase: 'fase1-4-local',
    surface: 'superficie-1-electron-conductor',
    actorOrSurface: 'Electron UI (Conductor) — step 0 del wizard local',
    humanActionSimulated: 'Login de identidad contra el backend nuevo (Auth 1) — sin token, sin Vault',
    eventGenerated: "IPC synapse-simulator:inject-milestone → milestone:reached {stepId:'backend_identity_check', branch, orgId?, role?}",
    receiverOrWaitMechanism:
      'milestone-reactor.js::_onBackendIdentityCheckComplete() persiste la rama en nucleus.json y habilita "Continuar →"',
    status: 'construido',
    implementedInRunner: true,
    notes:
      'Implementado en src/surfaces/backend-identity-check.ts (injectBackendIdentityCheck/injectBackendIdentityCheckFailure). ' +
      'Este PoC solo ejercita branch "master_new_org" (mismo KNOWN_LIMITATION_FOUNDER_ONLY que 00a/00b). Auth 1 ≠ Auth 2 ' +
      '(github_app_auth, pasos 02/03 abajo) — restricción de diseño cerrada, dos autenticaciones independientes.',
  },
  {
    id: '01',
    phase: 'fase1-4-local',
    surface: 'superficie-1-electron-conductor',
    actorOrSurface: 'Electron UI',
    humanActionSimulated: 'Clic en "Launch Discovery"',
    eventGenerated: 'onboarding:launch-discovery',
    receiverOrWaitMechanism: 'Brain/Nucleus — spawnea Chromium + perfil',
    status: 'construido',
    implementedInRunner: true,
    notes:
      'Gateado desde 2026-09-21 por backend_identity_check: nucleus_create.requires ahora incluye ' +
      "'backend_identity_validated', así que Electron abre el wizard directo en esa pantalla en un onboarding " +
      'nuevo — "Launch Discovery" no es alcanzable hasta completar el step anterior.',
  },
  {
    id: '02',
    phase: 'fase1-4-local',
    surface: 'superficie-2-chromium-discovery',
    actorOrSurface: 'Discovery',
    humanActionSimulated: 'Clic en "Auth GitHub"',
    eventGenerated: 'GITHUB_DEVICE_CODE',
    receiverOrWaitMechanism: 'Brain/SynapseBridge — código en pantalla',
    status: 'construido',
    implementedInRunner: true,
  },
  {
    id: '03',
    phase: 'fase1-4-local',
    surface: 'superficie-2-chromium-discovery',
    actorOrSurface: 'Chromium (frontera externa #2)',
    humanActionSimulated: 'Clic en "Authorize App"',
    eventGenerated: 'GITHUB_APP_AUTHORIZED',
    receiverOrWaitMechanism: 'Brain → Reactor → milestone:reached en Electron',
    status: 'construido',
    implementedInRunner: true,
    externalBoundaryId: 2,
  },
  {
    id: '04',
    phase: 'fase1-4-local',
    surface: 'superficie-2-chromium-discovery',
    actorOrSurface: 'Discovery',
    humanActionSimulated: 'Clic en "Detect Google" (frontera externa #5)',
    eventGenerated: 'ACCOUNT_REGISTERED',
    receiverOrWaitMechanism: 'Brain → Nucleus, actualiza nucleus.json',
    status: 'construido',
    implementedInRunner: true,
    externalBoundaryId: 5,
    notes: 'ACCOUNT_REGISTERED es la cuenta Google del Companion — no confundir con el registro server-side de 00a.',
  },
  {
    id: '05',
    phase: 'fase1-4-local',
    surface: 'superficie-1-electron-conductor',
    actorOrSurface: 'Electron UI',
    humanActionSimulated: 'Transición a success',
    eventGenerated: '_onOnboardingSuccess',
    receiverOrWaitMechanism: 'Electron Main — cierra wizard / redirige',
    status: 'construido',
    implementedInRunner: true,
  },
  {
    id: '06',
    phase: 'fase1-4-local',
    surface: 'superficie-4-cli-contingencia',
    actorOrSurface: 'Submit Simulator (UI-driven)',
    humanActionSimulated: 'Interacción DOM aún sin definir',
    eventGenerated: 'TON/payload serializado → dispatch',
    receiverOrWaitMechanism: 'A definir cuando exista el módulo',
    status: 'pending_feature_en_diseno',
    implementedInRunner: false,
    notes: 'Ver src/surfaces/submit-cli.ts — punto de inserción ya listo, contingencia CLI mientras tanto.',
  },
  {
    id: '06-contingencia',
    phase: 'fase1-4-local',
    surface: 'superficie-4-cli-contingencia',
    actorOrSurface: "Proceso CLI (brain intent submit)",
    humanActionSimulated: "spawn() desde el harness",
    eventGenerated: 'Publicación TCP vía synapse_manager.py',
    receiverOrWaitMechanism: 'stdout/stderr/exit code + synapse-simulator.html',
    status: 'construido',
    implementedInRunner: true,
    notes: 'Fuera de banda — no representativo del objetivo 100% UI-driven.',
  },
  {
    id: '07',
    phase: 'fase1-4-local',
    surface: 'superficie-2-chromium-discovery',
    actorOrSurface: 'Chromium — tab activa',
    humanActionSimulated: 'Navegar a dominio en AI_SIDE_PANEL_DOMAINS',
    eventGenerated: 'chrome.sidePanel.setOptions(enabled:true)',
    receiverOrWaitMechanism: 'Confirmar panel habilitado antes de targetear su CDP Target',
    status: 'construido',
    implementedInRunner: true,
  },
  {
    id: '08',
    phase: 'fase1-4-local',
    surface: 'superficie-3-companion-side-panel',
    actorOrSurface: 'Side Panel (Companion)',
    humanActionSimulated: 'Clic en acción que emite COMMAND_RUN_*',
    eventGenerated: 'COMMAND_ACK (inmediato) → cola',
    receiverOrWaitMechanism: 'Esperar COMMAND_ACK por el Port',
    status: 'construido',
    implementedInRunner: true,
  },
  {
    id: '09',
    phase: 'fase1-4-local',
    surface: 'superficie-3-companion-side-panel',
    actorOrSurface: 'background-companion.js',
    humanActionSimulated: '—',
    eventGenerated: 'ENGINE_STATUS_CHANGED: WAKING→READY',
    receiverOrWaitMechanism: 'Broadcast por Port propio del Runner',
    status: 'construido',
    implementedInRunner: true,
  },
  {
    id: '10',
    phase: 'fase1-4-local',
    surface: 'superficie-3-companion-side-panel',
    actorOrSurface: 'Tab Gemini (frontera externa #6)',
    humanActionSimulated: 'Inyección DOM (injectAndObserve)',
    eventGenerated: 'ENGINE_RESPONSE_CAPTURED / ENGINE_INJECTION_FAILED',
    receiverOrWaitMechanism: 'Port propio del Runner',
    status: 'construido_selectores_sin_verificar',
    implementedInRunner: true,
    externalBoundaryId: 6,
  },
  {
    id: '11',
    phase: 'fase1-4-local',
    surface: 'superficie-3-companion-side-panel',
    actorOrSurface: 'Side Panel',
    humanActionSimulated: 'Reflejar REPORT_RESULT/REPORT_ERROR',
    eventGenerated: "DOM: #refined-response[data-state]",
    receiverOrWaitMechanism: 'Aserción directa sobre el DOM del panel',
    status: 'construido',
    implementedInRunner: true,
  },
];

/**
 * Las seis fronteras externas confirmadas (Requerimiento Integrado §4) —
 * NO tres, NO cuatro. Cualquier código/doc del Runner que cuente menos está
 * desactualizado.
 */
export interface ExternalBoundary {
  id: number;
  name: string;
  phase: FlowPhase | 'transversal';
  automatedByRunner: boolean;
  notes?: string;
}

export const EXTERNAL_BOUNDARIES: ExternalBoundary[] = [
  {
    id: 1,
    name: 'Login GitHub del backend (Auth Code+PKCE, GitHub App propia del backend)',
    phase: 'fase0-server',
    automatedByRunner: false,
    notes:
      'Pasos 00a-00b — deliberadamente NUNCA automatizada (nunca navega a github.com): el backend en modo ' +
      'AUTHORITY_ALLOW_TEST_FIXTURES=true inyecta el estado post-login por fixture, esquivando la frontera ' +
      'en vez de cruzarla. Ver phase0-generic-browser.ts. Sección 14.1 resuelta 2026-09-20.',
  },
  {
    id: 2,
    name: 'Repo Ops (GitHub App + Device Flow, Cortex/Discovery)',
    phase: 'fase1-4-local',
    automatedByRunner: true,
    notes: 'Paso 03. Se asume sesión ya autorizada en el perfil de Chromium del Runner — no automatiza credenciales reales.',
  },
  {
    id: 3,
    name: 'Batcave Auth (control plane Codespaces)',
    phase: 'transversal',
    automatedByRunner: false,
    notes: 'Fuera del camino crítico de onboarding de usuario final — código fuente fuera de este repo.',
  },
  {
    id: 4,
    name: 'GitHub App instalada por organización (acceso a repos)',
    phase: 'transversal',
    automatedByRunner: false,
    notes: 'Sin ruta HTTP dedicada auditada — no requiere automatización en este PoC.',
  },
  {
    id: 5,
    name: 'Detección de cuenta Google (Companion)',
    phase: 'fase1-4-local',
    automatedByRunner: true,
    notes: 'Paso 04. ACCOUNT_REGISTERED — no confundir con el registro del servidor (frontera #1).',
  },
  {
    id: 6,
    name: "Tab de Gemini (gemini.google.com, DOM de tercero, trust: 'untrusted-dom')",
    phase: 'fase1-4-local',
    automatedByRunner: true,
    notes: 'Paso 10. Selectores de injectAndObserve() sin verificar contra un browser real.',
  },
];

/** Limitación conocida y registrada del alcance actual del PoC — Requerimiento Integrado §14.2. */
export const KNOWN_LIMITATION_FOUNDER_ONLY =
  'Este PoC (Superficie 0 incluida, cuando deje de ser stub) sólo puede simular el flujo ' +
  'del usuario FUNDADOR. No existe, en el backend actual, ningún camino que cree una ' +
  'identidad verificada para un segundo miembro invitado dentro de una organización ya ' +
  'existente — los dos únicos INSERT INTO authority_human_identities del repo son para el ' +
  'mismo fundador (administration.ts / administration-store.ts / human-session-store.ts). ' +
  'Simular un segundo usuario invitado NO es posible hasta que ese gap se resuelva en el ' +
  'backend — ver §14.2 del Requerimiento Integrado.';
