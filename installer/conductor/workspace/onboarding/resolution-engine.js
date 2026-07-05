'use strict';

/**
 * workspace/onboarding/resolution-engine.js
 *
 * Calcula dinámicamente en qué step debe estar parado el usuario, evaluando
 * el estado real del sistema contra el SSOT (onboarding_steps.json) — no
 * contra un puntero tipo "último step completado".
 *
 * Reemplaza la lógica que antes vivía repartida entre:
 *   - onboarding-handlers.js → onboarding:get-resume-state (completedSteps/currentStep)
 *   - onboarding.js (renderer) → RESUME_STEP_ORDER hardcodeado
 *
 * Regla (Requerimiento 1, auditoria-stepper-workspace.md):
 *   El punto de entrada es el primer step, en el orden del SSOT, cuyos
 *   `requires` están satisfechos pero cuyo `produces` todavía no existe.
 *   Si todos los steps bloqueantes ya producen su artefacto, el resultado
 *   es el sentinel '__onboarding_complete__'.
 */

const fs = require('fs');
const { checkArtifact } = require('./step-verifiers');

const ONBOARDING_COMPLETE = '__onboarding_complete__';

/**
 * @param {object[]} steps        registry.steps — ya normalizados por MilestoneRegistry
 * @param {string}   nucleusJsonPath  path absoluto a nucleus.json
 * @returns {{ stepId: string, produced: string[] }}
 */
function resolveEntryPoint(steps, nucleusJsonPath) {
  let nucleusData = {};
  try {
    nucleusData = JSON.parse(fs.readFileSync(nucleusJsonPath, 'utf8'));
  } catch (e) {
    // nucleus.json no existe todavía (primera corrida) — todo se trata como
    // no producido, el resultado natural es el primer step del SSOT.
    console.warn('[resolution-engine] no se pudo leer nucleus.json:', e.message);
  }

  const produced = new Set();
  for (const step of steps) {
    if (step.produces && checkArtifact(step, nucleusData)) {
      produced.add(step.produces);
    }
  }

  for (const step of steps) {
    const requiresMet = (step.requires || []).every(r => produced.has(r));
    const alreadyDone  = step.produces ? produced.has(step.produces) : false;
    if (requiresMet && !alreadyDone) {
      return { stepId: step.id, produced: [...produced] };
    }
  }

  return { stepId: ONBOARDING_COMPLETE, produced: [...produced] };
}

module.exports = { resolveEntryPoint, ONBOARDING_COMPLETE };
