// src/lib/bootstrap/genesisLaunch.ts
//
// D-23 / B.4.1 (BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_2.md §1.2/§6,
// Fase B): hook de arranque automático de Genesis del lado de Core.
//
// Contraparte de onboarding-handlers.js: Core lee el pending sin borrarlo,
// crea el Mandate y recién entonces confirma el launch con el mandateId.
//
// CAMBIO (implementación post Mandate_Event_Mechanism_Auditoria_v1.md,
// frente 1): la creación del mandate en sí pasó de Camino 1 (IPC → CLI Go,
// `window.onboarding.createMandate`) a Camino 2 (Fastify → Node, `POST
// /api/v1/mandates`). Motivo, con evidencia en la auditoría: Camino 2 emite
// `publishMandateEvent` de forma inmediata y síncrona, sin depender de
// `mandate_watcher.go` — que está confirmado sin arrancar bajo `nucleus
// dev-start` (ver TD-001, docs/tech-debt/). Camino 1 seguía siendo válido
// para *escribir* el mandate, pero no emitía ningún evento bajo el flujo
// real de la app; Camino 2 sí, en cualquier escenario. El timing de
// `:48215` (Control Plane) está confirmado disponible antes de que este
// hook corra — ver mismo documento, Addendum B — así que no hay riesgo de
// carrera al cambiar de camino.
//
// La lectura y el acknowledge del flag siguen siendo IPC: el proceso main de
// Electron conserva la propiedad de nucleus.json.
//
// Alcance: este módulo dispara la creación y logea el resultado. La
// hidratación de la UI (abrir/actualizar el tab correspondiente) ya no
// depende de este hook — corre por su cuenta vía websocketStore +
// mandateStore (ver +layout.svelte, frente 3 de la misma auditoría): el
// evento `mandate:build:initiated` que este POST dispara llega por WS y
// actualiza mandateStore igual, sin importar quién disparó la creación.

import { createMandate as createMandateApi } from '$lib/api';

type PendingGenesisLaunch = {
  mandateLaunchId: string;
  projectId: string;
  project: string;
  projectPath: string;
};

type ReadPendingGenesisLaunchResult = {
  success: boolean;
  pending: PendingGenesisLaunch | null;
  error?: string;
};

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

/**
 * Consume el flag "arrancá Genesis" (si existe) y, de estar presente,
 * dispara la creación real del mandate vía Camino 2 (Fastify). Seguro de
 * llamar siempre — no-op silencioso si no hay bridge de Electron (ej. dev
 * server standalone sin Conductor) o si no hay nada pendiente.
 *
 * Se llama una vez, en el onMount de +layout.svelte.
 */
export async function runPendingGenesisLaunch(): Promise<void> {
  const onboarding = getOnboardingBridge();
  if (!onboarding?.readPendingGenesisLaunch || !onboarding?.ackPendingGenesisLaunch) {
    // No es un error: pasa en cualquier entorno sin preload_core.js (dev
    // server standalone del webview, fuera de Electron).
    return;
  }

  let readResult: ReadPendingGenesisLaunchResult;
  try {
    readResult = await onboarding.readPendingGenesisLaunch();
  } catch (e) {
    console.error('[genesisLaunch] readPendingGenesisLaunch falló:', e);
    return;
  }

  if (!readResult?.success) {
    console.warn('[genesisLaunch] readPendingGenesisLaunch — success:false', readResult);
    return;
  }

  const pending = readResult.pending;
  if (!pending) {
    // Camino normal en cualquier apertura de Core que no viene de un
    // Onboarding recién cerrado — nada que hacer.
    return;
  }
  const mandateLaunchId = pending.mandateLaunchId || (pending as PendingGenesisLaunch & { genesisLaunchId?: string }).genesisLaunchId;
  if (!pending.projectId || !mandateLaunchId) {
    console.error('[genesisLaunch] pending_genesis_launch sin identidad completa — no se crea el Mandate', pending);
    return;
  }

  console.log('[genesisLaunch] pending_genesis_launch encontrado — creando mandate vía Camino 2 (Fastify):', pending);

  try {
    const result = await createMandateApi({
      mandateLaunchId,
      mandateType: 'genesis',
      projectId: pending.projectId,
      project: pending.project,
      projectPath: pending.projectPath,
      // No existe todavía un concepto de "nombre" separado del proyecto en
      // este flujo (ver mandate.go: la CLI tampoco lo pedía) — se reusa el
      // nombre de proyecto, igual que hacía Camino 1 implícitamente.
      name: pending.project,
      // Camino 1 mandaba --source <projectPath>. projectPath puede venir
      // vacío (selección de repo de GitHub sin carpeta local) — GenesisCreateBody
      // exige source no vacío, así que se cae a un marcador explícito.
      source: pending.projectPath || 'onboarding',
    });
    const ack = await onboarding.ackPendingGenesisLaunch({
      mandateLaunchId,
      mandateId: result.mandateId,
    });
    if (!ack?.success) throw new Error(`genesis_launch_ack_failed:${ack?.error || 'unknown'}`);
    console.log('[genesisLaunch] Genesis Mandate creado automáticamente al entrar a Core (Camino 2):', result);
  } catch (e) {
    console.error('[genesisLaunch] createMandate (Camino 2) falló:', e);
  }
}
