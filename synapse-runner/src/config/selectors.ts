/**
 * Selectores de UI usados por la suite E2E.
 *
 * 🔶 NINGUNO de estos selectores fue verificado contra un browser real en
 * esta sesión — es exactamente el punto abierto no bloqueante de la
 * Sección 7, punto 3 del dossier ("verificar contra un browser real los
 * selectores de injectAndObserve()..."), extendido acá también a Discovery
 * (que tampoco fue auditado campo por campo, solo a nivel de archivo).
 *
 * Se centralizan ACÁ, en un solo lugar editable, en vez de hardcodearlos
 * dispersos en los specs — así la primera corrida real solo requiere tocar
 * este archivo, no el harness. Ver README § "Puntos abiertos no
 * bloqueantes" para el procedimiento de verificación sugerido.
 */
export const SELECTORS = {
  discovery: {
    /** Botón "Auth GitHub" — paso 02 de la Matriz de Flujo. */
    authGithubButton: '#btn-start-github-device-flow',
    /** Botón "Detect Google" — paso 04. */
    detectGoogleButton: '__TODO_VERIFY__ [data-action="detect-google"]',
  },
  companion: {
    /** #refined-response[data-state] — paso 11, aserción directa sobre el DOM del panel. */
    refinedResponse: '#refined-response',
    /** #technical-log-list — expander de log técnico. */
    technicalLogList: '#technical-log-list',
  },
} as const;

export function assertSelectorConfigured(selector: string, context: string): void {
  if (selector.startsWith('__TODO_VERIFY__')) {
    throw new Error(
      `[selectors] "${context}" todavía apunta a un selector placeholder sin verificar (${selector}). ` +
        `Confirmalo contra el DOM real y actualizá src/config/selectors.ts — ver README § "Puntos abiertos no bloqueantes".`,
    );
  }
}
