'use strict';

/**
 * workspace/onboarding/step-verifiers.js
 *
 * Verificadores de artefactos para el motor de resume (resolution-engine.js).
 * Cada función responde una sola pregunta: "¿el 'produces' de este step
 * existe de verdad en el sistema?" — leyendo nucleus.json y/o el filesystem.
 *
 * IMPORTANTE: estas funciones son síncronas y no hacen I/O de red ni llaman
 * a execNucleus. La decisión de producto (ver auditoria-stepper-workspace.md,
 * Requerimiento 1) fue verificar vault_init, google_auth y ai_provider_setup
 * contra campos que el MilestoneReactor persiste en nucleus.json al procesar
 * el milestone correspondiente — no contra un chequeo de red en vivo.
 *
 * Tipos de 'verify' soportados (declarados en onboarding_steps.json):
 *   - 'json_field'      → onboarding.<algo> debe ser truthy
 *   - 'json_field_any'  → al menos uno de varios campos debe ser truthy
 *   - 'fs_marker'       → un directorio (leído de nucleus.json) debe contener
 *                          un archivo marcador específico
 */

const fs   = require('fs');
const path = require('path');

/**
 * Lee un path tipo 'onboarding.workspace_path' contra el objeto nucleusData.
 * @param {object} nucleusData  Contenido completo de nucleus.json ya parseado
 * @param {string} fieldPath
 * @returns {*}
 */
function getField(nucleusData, fieldPath) {
  return fieldPath.split('.').reduce((obj, key) => obj?.[key], nucleusData);
}

const VERIFIERS = {
  json_field(nucleusData, { field }) {
    return !!getField(nucleusData, field);
  },

  json_field_any(nucleusData, { fields }) {
    return fields.some(f => !!getField(nucleusData, f));
  },

  fs_marker(nucleusData, { jsonField, markerFile }) {
    const dir = getField(nucleusData, jsonField);
    if (!dir) return false;
    try {
      return fs.existsSync(path.join(dir, markerFile));
    } catch {
      return false;
    }
  },
};

/**
 * Verifica si el 'produces' de un step existe de verdad.
 *
 * @param {object} step         Un step normalizado del SSOT (onboarding_steps.json)
 * @param {object} nucleusData  nucleus.json ya parseado (leerlo una sola vez por
 *                              resolución, no por step — ver resolution-engine.js)
 * @returns {boolean}
 */
function checkArtifact(step, nucleusData) {
  const verifier = VERIFIERS[step.verify];
  if (!verifier) {
    console.warn(`[step-verifiers] tipo de verify desconocido: "${step.verify}" (step: ${step.id})`);
    return false;
  }
  return verifier(nucleusData, step.verifyArgs || {});
}

module.exports = { checkArtifact, getField, VERIFIERS };
