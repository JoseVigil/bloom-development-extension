#!/usr/bin/env ts-node
import { resolve } from 'node:path';
import {
  assertR0Isolation, formatEnvironmentChecks, runEnvironmentChecks, summarizeDarwinR0Evidence, type DarwinR0Evidence,
} from '../src/preflight/environment-check';
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

  // Windows/Darwin: gate fail-closed antes de 00a. Si no se demuestra el entorno de
  // prueba aislado, el preflight termina con código distinto de cero y
  // `npm run test:headed` no llega a Playwright.
  if (process.platform === 'darwin' || (process.platform === 'win32' && process.env.SYNAPSE_TEST_WORKSPACE_ORG)) {
    try {
      const evidence = assertR0Isolation('before-00a') as DarwinR0Evidence;
      console.log(`✅ R0 before-00a: ${JSON.stringify(process.platform === 'darwin' ? summarizeDarwinR0Evidence(evidence) : { target: evidence.target, phase: evidence.phase, runnerBase: evidence.runnerBase, workspacePath: evidence.workspacePath, workspaceOrg: evidence.workspaceOrg, backendOrigin: evidence.backendOrigin })}`);
    } catch (err) {
      console.error(`🔴 ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }
  }

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

/**
 * globalSetup de Playwright (registrado en playwright.config.ts). Darwin
 * exige aislamiento para toda la suite; Windows lo comprueba dentro del E2E
 * de onboarding y antes del reset, sin bloquear los gates de RUNNER CORE.
 */
export default function globalSetup(): void {
  if (process.platform === 'darwin') assertR0Isolation('before-00a');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('🔴 [preflight] Error inesperado:', err);
    process.exitCode = 1;
  });
}
