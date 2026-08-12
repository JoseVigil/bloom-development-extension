// src/lib/bootstrap/genesisLaunch.ts
//
// D-23 / B.4.1 (BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_2.md §1.2/§6,
// Fase B): hook de arranque automático de Genesis del lado de Core.
//
// Contraparte de onboarding-handlers.js → 'onboarding:consume-pending-
// genesis-launch': si Onboarding acaba de cerrar y dejó
// onboarding.pending_genesis_launch en nucleus.json, Core lo consume (lee +
// borra, vía el mismo IPC) al bootear y dispara la creación real del
// mandate con window.onboarding.createMandate(...) — el mismo canal IPC que
// ya existía (onboarding:create-mandate), sin cambios de Electron; lo único
// que cambia es quién lo invoca.
//
// Alcance deliberadamente acotado (ver D-25 en el roadmap, todavía abierto):
// esto NO abre un tab de MandateTab ni actualiza mandateStore.ts — ese
// store hoy es un placeholder de datos de ejemplo (ver mandateStore.ts), y
// la UI final donde "aterriza" un mandate recién creado depende de que D-25
// (frontera GenesisTab/StandardMandateTab, ya resuelta como "no hace
// falta") se termine de construir en el Paso 4 de la migración de UI. Este
// módulo es el hook preparado que pide B.4.1 — queda listo para que, una
// vez que exista esa UI, alguien conecte el resultado de createMandate acá
// abajo a tabsStore/mandateStore reales, en vez de tener que descubrir de
// cero el mecanismo de consumo del flag.

type PendingGenesisLaunch = {
  project: string;
  projectPath: string;
};

type ConsumePendingGenesisLaunchResult = {
  success: boolean;
  pending: PendingGenesisLaunch | null;
  error?: string;
};

type CreateMandateResult = {
  success: boolean;
  result?: unknown;
  error?: string;
};

function getOnboardingBridge(): any {
  return typeof window !== 'undefined' ? (window as any).onboarding : undefined;
}

/**
 * Consume el flag "arrancá Genesis" (si existe) y, de estar presente,
 * dispara la creación real del mandate. Seguro de llamar siempre —
 * no-op silencioso si no hay bridge de Electron (ej. dev server standalone
 * sin Conductor) o si no hay nada pendiente.
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

  console.log('[genesisLaunch] pending_genesis_launch encontrado — creando mandate:', pending);

  if (!onboarding.createMandate) {
    console.error('[genesisLaunch] window.onboarding.createMandate no disponible — no se puede completar el arranque automático');
    return;
  }

  let createResult: CreateMandateResult;
  try {
    createResult = await onboarding.createMandate({
      project: pending.project,
      projectPath: pending.projectPath,
    });
  } catch (e) {
    console.error('[genesisLaunch] createMandate falló:', e);
    return;
  }

  if (createResult?.success) {
    console.log('[genesisLaunch] Genesis Mandate creado automáticamente al entrar a Core:', createResult.result);
    // TODO (D-25, Paso 4 de la migración de UI): una vez que exista la UI
    // final de MandateTab conectada a datos reales, abrir acá el tab
    // correspondiente en vez de solo loguear.
  } else {
    console.error('[genesisLaunch] createMandate — success:false', createResult);
  }
}
