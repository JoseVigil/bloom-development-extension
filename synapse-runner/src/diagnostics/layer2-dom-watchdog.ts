import type { DiagnosticBus } from './diagnostic-bus';
import type {
  CompanionDiagnosticEvent,
  DomInjectionFailureMode,
  DiagnosticEvent,
} from './types';

/**
 * Capa 2 — Inyección DOM en Gemini (Sección 6).
 *
 * background-companion.js corre injectAndObserve() vía
 * chrome.scripting.executeScript en el DOM de gemini.google.com — el punto
 * más frágil de toda la arquitectura (selectores marcados "⚠️ verificar" en
 * el propio código fuente, Sección 7 punto 3, NO confirmados por este
 * dossier contra un browser real).
 *
 * Esta capa NO reimplementa la inyección — eso es responsabilidad de
 * background-companion.js. Lo que hace es DISTINGUIR, para cada comando
 * despachado, en cuál de los 3 modos de falla cayó (o si tuvo éxito),
 * cruzando los eventos crudos de la Capa 1 (Companion Port) con un watchdog
 * propio más largo que el timeout interno del background.
 *
 * Si el watchdog vence sin recibir REPORT_RESULT ni REPORT_ERROR, eso es en
 * sí mismo un hallazgo: el mecanismo de timeout interno de cortesía del
 * background dejó de dispararse — no solo falló el paso de negocio.
 */

export interface AwaitEngineOutcomeResult {
  mode: 'succeeded' | DomInjectionFailureMode;
  rawReason?: string;
  waitedMs: number;
}

export interface DomWatchdogOptions {
  /**
   * ENGINE_RESPONSE_TIMEOUT_MS del lado de background-companion.js.
   * 🔶 Sección 7 punto 2: valor exacto no confirmado en esta sesión —
   * ver README "Puntos abiertos". Configurable vía env
   * (ENGINE_RESPONSE_TIMEOUT_MS_FALLBACK) hasta que se extraiga el real.
   */
  engineResponseTimeoutMs: number;
  /** Margen extra sobre engineResponseTimeoutMs — RUNNER_WATCHDOG_MS = engineResponseTimeoutMs + slackMs. */
  slackMs: number;
}

/**
 * Espera el desenlace de un comando Companion ya despachado (commandId ya
 * agregado al Set `ownCommandIds` que consume layer1-companion-port), y
 * clasifica el resultado en uno de los 3 modos de falla de la Sección 6, o
 * éxito.
 */
export function awaitEngineOutcome(
  bus: DiagnosticBus,
  correlationId: string,
  options: DomWatchdogOptions,
): Promise<AwaitEngineOutcomeResult> {
  const runnerWatchdogMs = options.engineResponseTimeoutMs + options.slackMs;
  const startedAt = Date.now();

  return new Promise((resolve) => {
    let settled = false;

    const onEvent = (event: DiagnosticEvent) => {
      if (settled) return;
      if (event.layer !== 'companion') return;
      const companionEvent = event as CompanionDiagnosticEvent;
      if (companionEvent.kind !== 'companion_failure' && companionEvent.kind !== 'companion_result') {
        return;
      }
      if (companionEvent.correlationId !== correlationId) return;

      settled = true;
      clearTimeout(timer);
      bus.off('event', onEvent);

      const waitedMs = Date.now() - startedAt;

      if (companionEvent.kind === 'companion_result') {
        bus.emitDiagnostic({
          layer: 'dom_injection',
          kind: 'dom_injection_succeeded',
          capturedAt: Date.now(),
          correlationId,
        });
        resolve({ mode: 'succeeded', waitedMs });
        return;
      }

      const mode = classifyFailureReason(companionEvent.reason);
      bus.emitDiagnostic({
        layer: 'dom_injection',
        kind: 'dom_injection_failed',
        mode,
        rawReason: companionEvent.reason,
        capturedAt: Date.now(),
        correlationId,
      });
      resolve({ mode, rawReason: companionEvent.reason, waitedMs });
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      bus.off('event', onEvent);

      bus.emitDiagnostic({
        layer: 'dom_injection',
        kind: 'dom_injection_failed',
        mode: 'silent_hang',
        capturedAt: Date.now(),
        correlationId,
      });
      resolve({ mode: 'silent_hang', waitedMs: Date.now() - startedAt });
    }, runnerWatchdogMs);

    bus.on('event', onEvent);
  });
}

/**
 * Los 3 modos de falla de la Sección 6, tabla "Capa 2":
 *   - INPUT_NOT_FOUND        → selector de input roto (Gemini cambió el DOM)
 *   - ENGINE_RESPONSE_ERROR  → rate limit, contenido bloqueado, error de red
 *   - (cualquier otro)       → tratado como engine_response_error por defecto,
 *                              nunca como "falló, sin más" — se preserva
 *                              rawReason para el bundle de diagnóstico.
 */
function classifyFailureReason(reason: string): DomInjectionFailureMode {
  if (reason === 'INPUT_NOT_FOUND') return 'input_not_found';
  // Incluye 'ENGINE_RESPONSE_ERROR' — discrepancia de documentación conocida
  // (Sección 7 punto 5): el código lo emite pero no está en knownReasons
  // documentado de companionProtocol.js v2.0.0. El Runner lo tolera igual.
  return 'engine_response_error';
}
