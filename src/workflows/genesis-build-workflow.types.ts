import type { GenMandateType } from '../types/gen-state.types';

/**
 * Input de `MandateGenesisBuildWorkflow` (§6.1). El propio código del
 * workflow no es parte de esta tarea (ya está definido en §6.1 del
 * diseño) — esto es solo el contrato de entrada que el handler de
 * creación necesita para el `client.start(...)`.
 */
export interface GenesisBuildInput {
  mandateId: string;
  mandateType: GenMandateType;
  project: string;
  name: string;
  source: string;
  /** solo domain_expansion — ver §1.3: input adicional para que Brain
   *  distinga "dominio nuevo" de "extensión de un dominio existente" */
  baseGenesisId?: string;
}

export const GENESIS_BUILD_WORKFLOW_TYPE = 'MandateGenesisBuildWorkflow' as const;

/** Convención de Temporal: 1 workflow run por mandateId, sin colisiones. */
export function genesisBuildWorkflowId(mandateId: string): string {
  return `mandate-genesis-build:${mandateId}`;
}
