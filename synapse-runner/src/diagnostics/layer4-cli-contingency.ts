import { spawn } from 'node:child_process';
import type { DiagnosticBus } from './diagnostic-bus';
import type { CliFailureClassification, CliSubmitResultEvent } from './types';

/**
 * Capa 4 — Proceso CLI de contingencia (`brain intent submit`).
 *
 * Paso 06-contingencia de la Matriz de Flujo (Sección 3): el Submit
 * Simulator UI-driven todavía no existe (Sección 2C — PENDING / FEATURE EN
 * DISEÑO). Mientras tanto, este módulo invoca el CLI real como testigo, NO
 * como UI (Sección 4, punto 4) — debe quedar etiquetado explícitamente como
 * fuera de banda / no representativo del objetivo 100% UI-driven en el
 * reporte del Runner. Ver runner/synapse-runner.ts y el bundle de
 * diagnóstico que arma correlator.ts (step: "06-contingencia_submit_intent").
 *
 * Clasificación de fallas según los `except` reales de submit.py (Sección
 * 6): ValueError/FileNotFoundError → problema de serialización de TON;
 * ConnectionError/TimeoutError → problema del socket TCP 127.0.0.1:5678
 * (posiblemente 'brain synapse host' no está corriendo).
 */

export interface CliContingencyOptions {
  brainBin: string;
  intentId: string;
  extraArgs?: string[];
}

export async function runSubmitContingency(
  bus: DiagnosticBus,
  options: CliContingencyOptions,
): Promise<CliSubmitResultEvent> {
  const { brainBin, intentId, extraArgs = [] } = options;

  return new Promise((resolve) => {
    const args = ['intent', 'submit', '--intent-id', intentId, '--json', ...extraArgs];
    const proc = spawn(brainBin, args, { stdio: 'pipe' });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      // El propio spawn falló (binario no encontrado, permisos, etc.) —
      // esto también es información de diagnóstico, no una excepción a
      // dejar escapar.
      const event: CliSubmitResultEvent = {
        layer: 'cli_contingency',
        kind: 'cli_submit_result',
        exitCode: null,
        stdout,
        stderr: `${stderr}\n[spawn_error] ${err.message}`.trim(),
        failed: true,
        classifiedAs: 'unknown',
        intentId,
        capturedAt: Date.now(),
        correlationId: intentId,
      };
      bus.emitDiagnostic(event);
      resolve(event);
    });

    proc.on('close', (exitCode) => {
      const failed = exitCode !== 0;
      const classifiedAs = failed ? classifyCliFailure(stderr) : undefined;

      const event: CliSubmitResultEvent = {
        layer: 'cli_contingency',
        kind: 'cli_submit_result',
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        failed,
        classifiedAs,
        intentId,
        capturedAt: Date.now(),
        correlationId: intentId,
      };
      bus.emitDiagnostic(event);
      resolve(event);
    });
  });
}

function classifyCliFailure(stderr: string): CliFailureClassification {
  if (/ValueError|FileNotFoundError/.test(stderr)) return 'ton_serialization_error';
  if (/ConnectionError|TimeoutError|Connection refused|ECONNREFUSED/i.test(stderr)) {
    return 'tcp_bridge_unreachable';
  }
  return 'unknown';
}

export function describeCliFailure(classification: CliFailureClassification | undefined): string {
  switch (classification) {
    case 'ton_serialization_error':
      return 'El CLI falló al serializar el TON/payload (ValueError/FileNotFoundError en submit.py) — revisar build_payload.py / payload_builder.py.';
    case 'tcp_bridge_unreachable':
      return "El CLI falló por socket cerrado (127.0.0.1:5678) — verificar que 'brain synapse host' esté corriendo antes de este paso.";
    case 'unknown':
      return 'El CLI falló con una causa no clasificada — ver stderr crudo adjunto en el bundle de diagnóstico.';
    default:
      return 'El CLI se ejecutó sin fallas reportadas.';
  }
}
