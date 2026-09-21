/**
 * `backend_identity_check` — step 0 del onboarding LOCAL de Conductor (Auth
 * 1: solo identidad, corre antes que `nucleus_create`). No confundir con
 * los pasos 00a/00b de `phase0-generic-browser.ts` (Fase 0 SERVER-SIDE:
 * registro/login contra el backend Cloudflare vía HTTP puro) — son dos
 * cosas distintas que comparten el nombre "step 0" en distintos documentos:
 *
 *   - 00a/00b (`phase0-generic-browser.ts`): HTTP directo contra el backend
 *     Cloudflare (`/v1/authority/genesis/login` + `/v1/authority/human/callback`),
 *     sin Electron, sin browser. Ya implementado y verificado esta sesión.
 *   - `backend_identity_check` (este archivo): un step DENTRO del wizard de
 *     onboarding de Conductor (Electron ya corriendo), que valida identidad
 *     contra "el backend nuevo" — el mismo backend conceptualmente, pero
 *     integrado del lado cliente vía IPC, no vía HTTP directo desde el
 *     Runner. Ver `Encargo_Modificacion_Runner_Incorporacion_Step_BackendIdentityCheck_v1_0.md`
 *     (`ANALYSIS/CONDUCTOR/ONBOARDING/`, Project BTIPS).
 *
 * Contrato técnico (confirmado por lectura directa del código real de
 * Conductor en esta sesión — "para citar, no para inventar", §6 del
 * encargo — no por el documento de diseño solo):
 *
 *   - SSOT: `installer/native/config/onboarding/onboarding_steps.json`,
 *     espejado en `milestone-registry.js::FALLBACK_STEPS` (confirmado
 *     `id: 'backend_identity_check'`, `requires: []`,
 *     `produces: 'backend_identity_validated'`,
 *     `cortex_events: ['IDENTITY_VALIDATED']` — nombre de evento
 *     provisorio, ningún backend real lo emite todavía).
 *   - Downstream: `nucleus_create.requires` pasa de `[]` a
 *     `['backend_identity_validated']` (confirmado en el mismo archivo) —
 *     Electron abre el wizard directo en la pantalla de este step en un
 *     onboarding nuevo, ANTES de que "Launch Discovery"/`nucleus_create`
 *     sea alcanzable.
 *   - Contrato HTTP/WS real del backend de identidad: NO EXISTE todavía
 *     (§4/§9 del encargo — `onboarding:validate-backend-identity` es
 *     plomería vacía, confirmado en `ipc/onboarding-handlers.js`). Este
 *     archivo NO fabrica ese contrato — usa el único mecanismo real que
 *     existe hoy para completar el step: inyección directa vía Synapse
 *     Simulator.
 *   - Inyección (confirmado en `preload_onboarding.js` +
 *     `ipc/onboarding-handlers.js` +  `milestone-reactor.js`):
 *     `window.onboarding.injectMilestone({ stepId: 'backend_identity_check', data })`
 *     → IPC `synapse-simulator:inject-milestone` → `reactor.handleMilestone()`
 *     → handler dedicado `_onBackendIdentityCheckComplete()` (§6.6 del doc
 *     de diseño — NO usa `_defaultReaction()`, porque persiste y transporta
 *     `branch`/`orgId`/`role`, no solo el booleano) → persiste
 *     `onboarding.backend_identity_validated/_branch/_org_id/_role` en
 *     `nucleus.json` → emite `milestone:reached` con
 *     `{ stepId: 'backend_identity_check', branch, orgId, role, _ts }` →
 *     el renderer (`step-backend-identity.js`) habilita el botón
 *     `#btn-continue-backend-identity` (deshabilitado por defecto en
 *     `onboarding.html`).
 *   - El fallo de servidor NO es un milestone (no hay `produces` real) —
 *     va por el canal separado `window.onboarding.injectStepUpdate({stepId,
 *     phase:'ERROR', data})`, confirmado ya implementado en
 *     `ipc/onboarding-handlers.js` (contradice la nota "hay que crearlo"
 *     del borrador v0.1 del documento de diseño — la v1.0/el código real ya
 *     lo tienen).
 *   - Ambos canales de inyección están deshabilitados en builds
 *     empaquetados (`app.isPackaged`) — solo funcionan contra un build de
 *     desarrollo de Conductor, igual que el resto de este harness.
 *
 * Restricción de diseño no negociable (§3 del encargo): esto es Auth 1,
 * SOLO identidad — nunca se pide ni se inyecta ningún token acá. Auth 2
 * (`github_app_auth`, ya existente, pasos 02/03 de `onboarding-flow.spec.ts`)
 * sigue siendo la única que produce el token operativo real.
 */

import type { Page } from '@playwright/test';

export type BackendIdentityBranch = 'master_new_org' | 'invited_existing_org' | 'no_organization';

export interface BackendIdentityCheckPayload {
  branch: BackendIdentityBranch;
  /** Requerido si y solo si branch === 'invited_existing_org' (tabla §5/§8.4 del encargo). */
  orgId?: string;
  /** Requerido si y solo si branch === 'invited_existing_org'. */
  role?: string;
}

interface InjectMilestoneResult {
  success: boolean;
  stepId?: string;
  error?: string;
}

function validatePayload(payload: BackendIdentityCheckPayload): void {
  const hasOrgData = payload.orgId !== undefined || payload.role !== undefined;
  if (payload.branch === 'invited_existing_org' && (!payload.orgId || !payload.role)) {
    throw new Error(
      '[backend-identity-check] branch "invited_existing_org" requiere orgId y role — ver la tabla del ' +
        'Encargo_Modificacion_Runner_Incorporacion_Step_BackendIdentityCheck_v1_0.md §1/§5.',
    );
  }
  if (payload.branch !== 'invited_existing_org' && hasOrgData) {
    throw new Error(
      `[backend-identity-check] branch "${payload.branch}" no debe traer orgId/role — esos campos son ` +
        'exclusivos de "invited_existing_org" (misma tabla que arriba).',
    );
  }
}

/**
 * Inyecta la finalización exitosa de `backend_identity_check` directo en el
 * MilestoneReactor de Conductor, vía la IPC del Synapse Simulator — sin
 * pasar por ningún contrato HTTP/WS real (que no existe). `page` debe ser
 * la mainWindow de Conductor ya cargada (después de `launchConductor()` +
 * `installMilestoneBuffer()`).
 *
 * No hace click en ningún botón ni espera el milestone — eso es
 * responsabilidad del caller (ver `onboarding-flow.spec.ts`), para que el
 * caller decida si quiere Playwright esperando el mismo click que un
 * usuario real haría o no.
 */
export async function injectBackendIdentityCheck(page: Page, payload: BackendIdentityCheckPayload): Promise<void> {
  validatePayload(payload);

  const result = await page.evaluate(async (data: BackendIdentityCheckPayload) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (typeof w.onboarding?.injectMilestone !== 'function') {
      return { success: false, error: 'window.onboarding.injectMilestone no está disponible — ¿build empaquetado?' };
    }
    return w.onboarding.injectMilestone({ stepId: 'backend_identity_check', data });
  }, payload);

  const typed = result as InjectMilestoneResult;
  if (!typed?.success) {
    throw new Error(
      `[backend-identity-check] injectMilestone falló: ${typed?.error ?? 'respuesta inesperada'} — confirmar que ` +
        'Conductor corre en modo desarrollo (no empaquetado) y que initOnboardingBridge() ya inicializó el reactor.',
    );
  }
}

/**
 * Simula el escenario "fallo del servidor" (§5 de la tabla del encargo,
 * §8.4 del doc de diseño) — a propósito NO se modela como milestone
 * (`injectBackendIdentityCheck`), porque `backend_identity_check` no tiene
 * `produces` real en ese caso. Usa el canal separado de fase
 * (`onboarding:step-ui-update`, `phase: 'ERROR'`) confirmado ya
 * implementado en `ipc/onboarding-handlers.js`.
 */
export async function injectBackendIdentityCheckFailure(page: Page, reason = 'timeout'): Promise<void> {
  const result = await page.evaluate(async (r: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (typeof w.onboarding?.injectStepUpdate !== 'function') {
      return { success: false, error: 'window.onboarding.injectStepUpdate no está disponible — ¿build empaquetado?' };
    }
    return w.onboarding.injectStepUpdate({ stepId: 'backend_identity_check', phase: 'ERROR', data: { reason: r } });
  }, reason);

  const typed = result as InjectMilestoneResult;
  if (!typed?.success) {
    throw new Error(`[backend-identity-check] injectStepUpdate(ERROR) falló: ${typed?.error ?? 'respuesta inesperada'}`);
  }
}
