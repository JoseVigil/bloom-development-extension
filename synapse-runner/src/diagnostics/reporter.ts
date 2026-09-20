import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DiagnosticBundle } from './types';

/**
 * Persiste cada bundle de diagnóstico a disco a medida que se producen —
 * no al final de la corrida. Esto es deliberado: el objetivo (Sección 6 /
 * consigna punto 4) es detección TEMPRANA de fallas, así que un timeout o
 * crash del propio proceso Playwright a mitad de la corrida no debe dejarnos
 * sin visibilidad de qué pasos ya habían fallado.
 *
 * Formato: un archivo JSON por paso (legible individualmente) + un NDJSON
 * append-only con la corrida completa (para tooling / grep rápido).
 */
export class DiagnosticReporter {
  private readonly outDir: string;
  private readonly ndjsonPath: string;

  constructor(outDir = 'diagnostics-output') {
    this.outDir = outDir;
    mkdirSync(this.outDir, { recursive: true });
    this.ndjsonPath = join(this.outDir, 'run.ndjson');
  }

  record(bundle: DiagnosticBundle): void {
    const stepFile = join(this.outDir, `${sanitize(bundle.step)}.json`);
    writeFileSync(stepFile, JSON.stringify(bundle, null, 2), 'utf-8');
    appendFileSync(this.ndjsonPath, `${JSON.stringify(bundle)}\n`, 'utf-8');

    if (bundle.failed) {
      // eslint-disable-next-line no-console
      console.error(
        `\n🔴 [synapse-runner] Paso "${bundle.step}" FALLÓ — ${bundle.diagnosis}\n   Bundle: ${stepFile}\n`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`✅ [synapse-runner] Paso "${bundle.step}" OK`);
    }
  }
}

function sanitize(step: string): string {
  return step.replace(/[^a-z0-9_-]+/gi, '_');
}
