// src/lib/bootstrap/genesisLaunch.ts
//
// D-23 / B.4.1 (BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_2.md §1.2/§6,
// Fase B): hook de arranque automático de Genesis del lado de Core.
//
// Contraparte de onboarding-handlers.js → 'onboarding:consume-pending-
// genesis-launch': si Onboarding acaba de cerrar y dejó
// onboarding.pending_genesis_launch en nucleus.json, Core lo consume (lee +
// borra, vía el mismo IPC, sin cambios acá) al bootear.
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
// El consumo del flag (lectura + borrado de onboarding.pending_genesis_launch
// en nucleus.json) sigue siendo IPC — eso es lógica de archivo del proceso
// main de Electron, no tiene camino alternativo ni falta cambiarlo.
//
// Alcance: este módulo dispara la creación y logea el resultado. La
// hidratación de la UI (abrir/actualizar el tab correspondiente) ya no
// depende de este hook — corre por su cuenta vía websocketStore +
// mandateStore (ver +layout.svelte, frente 3 de la misma auditoría): el
// evento `mandate:genesis:initiated` que este POST dispara llega por WS y
// actualiza mandateStore igual, sin importar quién disparó la creación.

import { createMandate as createMandateApi } from '$lib/api';

type PendingGenesisLaunch = {
  projectId: string;
  project: string;
  projectPath: string;
};

type ConsumePendingGenesisLaunchResult = {
  success: boolean;
  pending: PendingGenesisLaunch | null;
  error?: string;
};

function getOnboardingBridge(): any {
  return typeof window !== 'undefined' ? (window as any).onboarding : undefined;
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
  if (!onboarding?.consumePendingGenesisLaunch) {
    // No es un error: pasa en cualquier entorno sin preload_core.js (dev
    // server standalone del webview, fuera de Electron).
    return;
  }

  let consumeResult: ConsumePendingGenesisLaunchResult;
  try {
    consumeResult = await onboarding.consumePendingGenesisLaunch();
  } catch (e) {
    console.error('[genesisLaunch] consumePendingGenesisLaunch falló:', e);
    return;
  }

  if (!consumeResult?.success) {
    console.warn('[genesisLaunch] consumePendingGenesisLaunch — success:false', consumeResult);
    return;
  }

  const pending = consumeResult.pending;
  if (!pending) {
    // Camino normal en cualquier apertura de Core que no viene de un
    // Onboarding recién cerrado — nada que hacer.
    return;
  }
  if (!pending.projectId) {
    console.error('[genesisLaunch] pending_genesis_launch sin projectId — no se crea el Mandate', pending);
    return;
  }

  console.log('[genesisLaunch] pending_genesis_launch encontrado — creando mandate vía Camino 2 (Fastify):', pending);

  try {
    const result = await createMandateApi({
      mandateType: 'genesis',
      projectId: pending.projectId,
      project: pending.project,
      // No existe todavía un concepto de "nombre" separado del proyecto en
      // este flujo (ver mandate.go: la CLI tampoco lo pedía) — se reusa el
      // nombre de proyecto, igual que hacía Camino 1 implícitamente.
      name: pending.project,
      // Camino 1 mandaba --source <projectPath>. projectPath puede venir
      // vacío (selección de repo de GitHub sin carpeta local) — GenesisCreateBody
      // exige source no vacío, así que se cae a un marcador explícito.
      source: pending.projectPath || 'onboarding',
    });
    console.log('[genesisLaunch] Genesis Mandate creado automáticamente al entrar a Core (Camino 2):', result);
  } catch (e) {
    console.error('[genesisLaunch] createMandate (Camino 2) falló:', e);
  }
}
