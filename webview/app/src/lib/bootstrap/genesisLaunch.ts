// src/lib/bootstrap/genesisLaunch.ts
//
// Continuidad de Genesis por proyecto, propiedad de Nucleus y expuesta por
// Conductor (preload_core.js). Core sólo lee el estado y, ante un gesto
// explícito del Paladín en MandateTab, pide una recuperación. Abrir Core no
// crea ni recupera ningún Mandate.

import { createMandate as createMandateApi } from '$lib/api';

export type GenesisAttempt = {
  mandateId: string;
  mandateLaunchId?: string;
  kind: 'legacy' | 'contract_v1';
  relationshipStatus: 'pending' | 'current' | 'superseded';
  recoveryRequestId?: string;
};

export type GenesisProjectRecord = {
  schemaVersion: 1;
  projectId: string;
  projectName: string;
  currentMandateId?: string;
  pendingRecovery?: { recoveryRequestId: string; mandateLaunchId: string };
  attempts: GenesisAttempt[];
};

function getOnboardingBridge(): any {
  return typeof window !== 'undefined' ? (window as any).onboarding : undefined;
}

export async function readGenesisProjectStatus(projectId: string): Promise<GenesisProjectRecord | null> {
  const bridge = getOnboardingBridge();
  if (!bridge?.genesisProjectStatus) return null;
  const result = await bridge.genesisProjectStatus({ projectId });
  if (!result?.success) throw new Error(result?.error || 'genesis_project_status_failed');
  return result.record ?? null;
}

export async function recoverGenesis(input: {
  projectId: string;
  project: string;
  previousMandateId: string;
  projectPath?: string;
  source?: string;
}): Promise<{ mandateId: string; replayed?: boolean }> {
  const bridge = getOnboardingBridge();
  if (!bridge?.recoverGenesis || !bridge?.ackGenesisRecovery) {
    throw new Error('genesis_recovery_bridge_unavailable');
  }
  const recoveryRequestId = crypto.randomUUID();
  const prepared = await bridge.recoverGenesis({
    projectId: input.projectId,
    project: input.project,
    source: input.source || 'core-recovery',
    expectedPreviousMandateId: input.previousMandateId,
    recoveryRequestId,
  });
  if (!prepared?.success) throw new Error(prepared?.error || 'genesis_recovery_prepare_failed');
  const created = await createMandateApi({
    mandateType: 'genesis',
    mandateLaunchId: prepared.mandateLaunchId,
    recoveryRequestId: prepared.recoveryRequestId,
    projectId: prepared.projectId,
    project: prepared.project,
    name: prepared.project,
    source: prepared.source,
    projectPath: prepared.projectPath || input.projectPath,
  });
  const acknowledged = await bridge.ackGenesisRecovery({
    projectId: prepared.projectId,
    recoveryRequestId: prepared.recoveryRequestId,
    mandateLaunchId: prepared.mandateLaunchId,
    mandateId: created.mandateId,
  });
  if (!acknowledged?.schemaVersion || acknowledged.currentMandateId !== created.mandateId) {
    throw new Error(acknowledged?.error || 'genesis_recovery_ack_failed');
  }
  return { mandateId: created.mandateId, replayed: prepared.replayed };
}
