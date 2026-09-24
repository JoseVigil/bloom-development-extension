/**
 * Superficie 0 — Fase 0 server-side (registro/login GitHub + descarga del
 * instalador), pasos 00a-00d de la Matriz de Flujo
 * (`src/config/flow-matrix.ts`, `FLOW_MATRIX` con `phase: 'fase0-server'`).
 *
 * El nombre de archivo ("browser") es histórico — viene de la primera
 * versión de esta superficie, que sí pensaba abrir un Chromium real vía
 * Playwright para automatizar la pantalla de GitHub. Esa idea era un error
 * de concepto (confundía el arnés de pruebas con el Synapse Simulator — ver
 * `brain/core/profile/web/templates/synapse-simulator/`) y quedó
 * descartada: 00a/00b de ESTE archivo ya NO usan Playwright, NI ningún
 * browser, ni tocan github.com. Se mantiene el nombre del archivo para no
 * romper las referencias existentes (flow-matrix.ts, specs, otras
 * superficies) — lo único que importa es que `FlowSurface` en
 * `flow-matrix.ts` sigue llamando a esto "superficie-0-browser-generico" a
 * nivel arquitectónico/documental, independientemente de cómo esté
 * implementada.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CÓMO SE RESOLVIÓ LA SECCIÓN 14.1 (AUTHORITY_BOUNDARY.md §1)
 * ─────────────────────────────────────────────────────────────────────────
 * El Requerimiento Integrado (§14.1) dejaba dos opciones abiertas: (A)
 * Playwright sujeto a la restricción, deteniéndose en la puerta de GitHub
 * con una sesión ya autenticada inyectada; o (B) Playwright fuera de
 * alcance, automatizando un login de prueba contra una cuenta dedicada.
 * José (2026-09-20) no eligió ninguna de las dos: en vez de forzar a
 * Playwright a navegar y tipear en páginas externas de GitHub, se adoptó el
 * mismo patrón que ya usa el Synapse Simulator del lado de la extensión —
 * inyección de estado por protocolo interno, nunca automatización de una
 * superficie externa real. Del lado del backend eso se implementa como un
 * modo fixture HTTP: `AUTHORITY_ALLOW_TEST_FIXTURES=true` (sólo
 * `.dev.vars`, nunca en un despliegue real — ver
 * `backend/src/authority/administration-route.ts#configuredAuthorityHumanResponse`
 * y `backend/.dev.vars.example`) activa `testFixtureProvider()`
 * (`backend/src/authority/human-identity.ts`), que nunca genera una URL de
 * github.com y nunca hace un fetch saliente.
 *
 * Con esto, 00a y 00b dejan de estar bloqueados por §14.1 — el dilema no se
 * "resolvió" en el sentido de elegir A o B, se esquivó por completo. Nunca
 * se cruza `AUTHORITY_BOUNDARY.md` §1 porque nunca se toca la superficie de
 * un proveedor externo — el backend, corriendo en modo fixture, inyecta él
 * mismo el estado que ese login real habría producido.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 00a + 00b — `runPhase0FixtureRegistration()`: HTTP puro, sin browser
 * ─────────────────────────────────────────────────────────────────────────
 * Dos llamadas HTTP directas contra el backend (con `AUTHORITY_ALLOW_TEST_FIXTURES=true`
 * ya activo del lado del servidor), replicando exactamente el journey que
 * ya prueba `backend/test/authority-genesis.spec.ts`:
 *
 *   00a — POST /v1/authority/genesis/login (body vacío: la organización
 *         todavía no existe) → { authorizationUrl } + cookie de flow
 *         (`__Host-authority-flow`). `beginGenesis()` en el backend.
 *
 *   00b — GET /v1/authority/human/callback?state=&code=<subject-fixture>,
 *         con la cookie de flow del paso anterior → el backend crea
 *         organización + tenant + identidad atómicamente (primera vez que
 *         se ve ese subject) y emite sesión (`__Host-authority-session`).
 *         Cae en `finishGenesis()` porque no hay fila en
 *         `authority_human_flows` para ese state (ver el comentario en
 *         `administration-route.ts` sobre el fallback finishHumanLogin →
 *         finishGenesis).
 *
 * `code` es un subject arbitrario elegido por este harness — con
 * `testFixtureProvider()`, `identify(token)` devuelve `{subject: token}`
 * tal cual, así que ese string ES el subject que queda registrado. Cada
 * corrida usa un subject nuevo (`crypto.randomUUID()` por defecto) para que
 * cada ejecución de la suite registre una organización nueva, igual que un
 * fundador registrándose por primera vez — no reintentar con el mismo
 * subject entre corridas si se quiere simular "founder nuevo" cada vez.
 *
 * Nada de esto navega a github.com, nada hace un fetch saliente a un
 * proveedor externo, y nada de esto funciona si el backend no tiene
 * `AUTHORITY_ALLOW_TEST_FIXTURES=true` — contra un backend real (sin ese
 * flag) esto falla cerrado con 503, igual que prueba
 * `backend/test/authority-administration-route.spec.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 00c — SIGUE BLOQUEADO, pero por un motivo DISTINTO y NO relacionado con
 * AUTHORITY_BOUNDARY.md
 * ─────────────────────────────────────────────────────────────────────────
 * `executePhase0Download()` sigue lanzando siempre. La descarga
 * (`GET /v1/releases/:releaseId/download`) no cruza ninguna frontera
 * externa — es una llamada al propio backend, servida desde R2 — así que
 * tampoco necesitaría browser ni fixture. El bloqueo real es otro: no
 * existe todavía una ruta de descubrimiento público de `releaseId` para un
 * humano anónimo recién registrado (§11/§13 del Requerimiento Integrado).
 * No confundir los dos bloqueos — ver el comentario de la función.
 *
 * 00d (instalar + `nucleus authority sync`) es manual incluso en el flujo
 * real, corre en el sistema operativo del usuario, y nunca fue ni será
 * responsabilidad de este archivo ni de Playwright — ver `flow-matrix.ts`.
 */

export const PHASE0_REGISTRATION_STATUS = 'IMPLEMENTED_VIA_FIXTURE_INJECTION' as const;
export const PHASE0_DOWNLOAD_STATUS = 'STUB_BLOCKED_RELEASE_ID_DISCOVERY' as const;

const FLOW_COOKIE_NAME = '__Host-authority-flow';
const SESSION_COOKIE_NAME = '__Host-authority-session';

function extractCookie(headers: Headers, name: string): string | undefined {
  // getSetCookie() es la API moderna (Node 18.15+/undici) que separa
  // múltiples Set-Cookie sin que un fetch los concatene mal — el backend
  // devuelve dos en 00b (limpia flow + setea sesión). Con fallback manual
  // por si el runtime no la expone.
  const raw =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie') ?? '').split(/,(?=\s*__Host-)/);
  const match = raw.find((v) => v.trim().startsWith(`${name}=`));
  return match?.split(';')[0].trim();
}

export interface Phase0GenesisFlow {
  authorizationUrl: string;
  flowCookie: string;
  browser: string;
}

/**
 * Paso 00a — POST /v1/authority/genesis/login. Sin `organizationId`: la
 * organización todavía no existe (Génesis, no login de una ya existente).
 * Requiere que el backend tenga `AUTHORITY_ALLOW_TEST_FIXTURES=true`
 * (ver `backend/.dev.vars.example`) — contra un backend sin ese flag esto
 * devuelve 503 (fail-closed, `testFixtureProvider` nunca se activa solo).
 */
export async function beginPhase0FixtureRegistration(backendOrigin: string): Promise<Phase0GenesisFlow> {
  const response = await fetch(`${backendOrigin}/v1/authority/genesis/login`, {
    method: 'POST',
    headers: { Origin: backendOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(
      `[phase0] 00a: POST /v1/authority/genesis/login devolvió ${response.status} — ¿el backend tiene ` +
        'AUTHORITY_ALLOW_TEST_FIXTURES=true en .dev.vars? Ver backend/.dev.vars.example.',
    );
  }
  const body = (await response.json()) as { authorizationUrl?: string };
  const flowCookie = extractCookie(response.headers, FLOW_COOKIE_NAME);
  if (!body.authorizationUrl || !flowCookie) {
    throw new Error('[phase0] 00a: respuesta del backend sin authorizationUrl o sin cookie de flow.');
  }
  const browser = flowCookie.slice(`${FLOW_COOKIE_NAME}=`.length);
  if (!browser) throw new Error('[phase0] 00a: cookie de flow sin secreto browser.');
  // eslint-disable-next-line no-console
  console.log(`[phase0-generic-browser] 00a ok (${PHASE0_REGISTRATION_STATUS}) — flow de génesis iniciado, sin tocar github.com.`);
  return { authorizationUrl: body.authorizationUrl, flowCookie, browser };
}

export interface Phase0RegistrationResult {
  organizationId: string;
  principalId: string;
  sessionCookie: string;
  csrf: string;
  expiresAt: string;
  created: boolean;
}

/**
 * Paso 00b — GET /v1/authority/human/callback?state=&code=<fixtureSubject>,
 * con la cookie de flow de `beginPhase0FixtureRegistration()`. `fixtureSubject`
 * es el subject que `testFixtureProvider().identify()` va a devolver tal
 * cual — es lo que decide qué organización/identidad queda registrada.
 */
export async function finishPhase0FixtureRegistration(
  backendOrigin: string,
  flow: Phase0GenesisFlow,
  fixtureSubject: string,
): Promise<Phase0RegistrationResult> {
  const state = new URL(flow.authorizationUrl).searchParams.get('state');
  if (!state) throw new Error('[phase0] 00b: la authorizationUrl de 00a no trae ?state=.');
  const url = `${backendOrigin}/v1/authority/human/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(fixtureSubject)}`;
  const response = await fetch(url, { method: 'GET', headers: { Cookie: flow.flowCookie } });
  if (!response.ok) {
    throw new Error(`[phase0] 00b: GET /v1/authority/human/callback devolvió ${response.status}.`);
  }
  const body = (await response.json()) as {
    organizationId?: string;
    principalId?: string;
    csrf?: string;
    expiresAt?: string;
    created?: boolean;
  };
  const sessionCookie = extractCookie(response.headers, SESSION_COOKIE_NAME);
  if (!body.organizationId || !body.principalId || !body.csrf || !body.expiresAt || !sessionCookie) {
    throw new Error('[phase0] 00b: respuesta del backend incompleta (falta organizationId/principalId/csrf/expiresAt/session cookie).');
  }
  // eslint-disable-next-line no-console
  console.log(
    `[phase0-generic-browser] 00b ok (${PHASE0_REGISTRATION_STATUS}) — organización ${body.organizationId} ` +
      `${body.created ? 'creada' : 'ya existía'} por inyección de fixture, sin tocar github.com.`,
  );
  return {
    organizationId: body.organizationId,
    principalId: body.principalId,
    sessionCookie,
    csrf: body.csrf,
    expiresAt: body.expiresAt,
    created: body.created ?? false,
  };
}

/**
 * Orquesta 00a + 00b en una sola llamada — el caso común para
 * `onboarding-flow.spec.ts`, que no necesita el resultado intermedio de
 * 00a por separado. `fixtureSubject` por defecto es un UUID nuevo por
 * corrida (ver el comentario de cabecera de este archivo).
 */
export async function runPhase0FixtureRegistration(
  backendOrigin: string,
  fixtureSubject: string = crypto.randomUUID(),
): Promise<Phase0RegistrationResult> {
  const flow = await beginPhase0FixtureRegistration(backendOrigin);
  return finishPhase0FixtureRegistration(backendOrigin, flow, fixtureSubject);
}

/**
 * Paso 00c — GET /v1/releases/:releaseId/download. SIEMPRE lanza hoy, pero
 * por un motivo TOTALMENTE DISTINTO al de 00a/00b (ver el comentario de
 * cabecera de este archivo): no hay todavía descubrimiento público de
 * `releaseId`. No es un bloqueo de AUTHORITY_BOUNDARY.md ni requiere
 * ninguna decisión de José — es un gap de producto separado (§11/§13 del
 * Requerimiento Integrado).
 */
export async function executePhase0Download(): Promise<never> {
  throw new Error(
    `[phase0-generic-browser] Paso 00c (${PHASE0_DOWNLOAD_STATUS}) no implementado — GET ` +
      '/v1/releases/:releaseId/download no tiene todavía una ruta de descubrimiento público de releaseId ' +
      'para un humano anónimo recién registrado (Requerimiento Integrado §11/§13). Distinto del bloqueo que ' +
      'tenían 00a/00b: ESTO no es AUTHORITY_BOUNDARY.md — 00a/00b ya corren de verdad vía ' +
      'runPhase0FixtureRegistration() en este mismo archivo.',
  );
}
