#!/usr/bin/env ts-node
import { resolve } from 'node:path';
import { runEnvironmentChecks, formatEnvironmentChecks } from '../src/preflight/environment-check';
import { checkExtensionParity, formatParityResult } from '../src/preflight/extension-parity-check';

/**
 * Preflight standalone — corre `npm run preflight` antes de la suite, o
 * automáticamente vía `npm test` (ver package.json).
 *
 * Objetivo (consigna, punto 4 + Sección 6): fallar rápido con causa clara
 * ANTES de que Playwright arranque a gastar minutos en timeouts que en
 * realidad son "el entorno no está levantado", no un bug del flujo.
 *
 * synapse-runner/ vive en la raíz del repo (../ desde scripts/), así que
 * repoRoot se resuelve relativo a este archivo — nunca hardcodeado.
 */
async function main(): Promise<void> {
  const repoRoot = resolve(__dirname, '..', '..');

  console.log('\n🔎 synapse-runner — preflight checks\n');

  const envResults = await runEnvironmentChecks();
  console.log(formatEnvironmentChecks(envResults));

  console.log('');
  const parity = checkExtensionParity(repoRoot);
  console.log(formatParityResult(parity));

  const hardFailures = envResults.filter((r) => !r.ok);
  console.log('');
  if (hardFailures.length > 0) {
    console.warn(
      `⚠️  ${hardFailures.length} chequeo(s) de entorno no pasaron. La suite puede correr igual, ` +
        `pero los pasos que dependen de esos servicios probablemente van a fallar con causa ya conocida.`,
    );
  } else {
    console.log('✅ Preflight completo — todos los chequeos de entorno pasaron.');
  }
}

main().catch((err) => {
  console.error('🔴 [preflight] Error inesperado:', err);
  process.exitCode = 1;
});
