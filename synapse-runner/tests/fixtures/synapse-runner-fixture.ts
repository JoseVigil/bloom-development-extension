import { test as base } from '@playwright/test';
import { SynapseRunner } from '../../src/runner/synapse-runner';

/**
 * Fixture de Playwright que engancha SynapseRunner (diagnóstico de 4 capas)
 * al ciclo de vida de cada test — arranca antes del test, imprime el
 * resumen y cierra la Capa 3 después, pase o falle el test.
 */
export const test = base.extend<{ synapseRunner: SynapseRunner }>({
  // eslint-disable-next-line no-empty-pattern
  synapseRunner: async ({}, use) => {
    const runner = new SynapseRunner();
    await runner.start();
    await use(runner);
    await runner.stop();
  },
});

export { expect } from '@playwright/test';
