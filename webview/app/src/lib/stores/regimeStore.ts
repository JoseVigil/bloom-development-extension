// webview/app/src/lib/stores/regimeStore.ts
//
// Alterna entre régimen Panel (default) y régimen Espacial (Orrery) —
// Spec_Implementacion_Integracion_Core_Orrery_v1_0.md §1.3, mismo patrón de
// store ya usado por tabsStore (tabs.ts): writable + funciones de mutación
// expuestas, sin lógica oculta en el componente que lo consume.
//
// Resuelve el foco inicial de forma determinística (v0.1 §3.3): Entrada B
// (con `seed.projectId`) resuelve el anchor de ese Project; Entrada A (sin
// seed) usa el último anchor visitado en esta sesión o, en su ausencia, la
// raíz del scope soberano activo. Ninguna ruta fabrica un anchor si la
// resolución falla — ver degradación de Entrada B en Spec §1.6.
//
// Nota (Spec §0/§1.8): no existe hoy un productor real de LocationSnapshot
// ni evidencia de binding en el cliente (ProjectsPanel.svelte no expone
// tenantId/organizationId — confirmado por lectura directa de ese archivo).
// Mientras esos gaps no se cierren, este store entrega siempre el árbol
// simulado (fromSimulatedData) — la navegación de Gateway UX ya es real,
// el contenido detrás sigue siendo el prototipo, tal como lo declara
// `tree.simulated`.

import { writable } from 'svelte/store';
import type { OrreryTree, OrreryRef } from '$orrery/locationTree';
import { fromSimulatedData } from '$orrery/adapters/fromSimulatedData';

export type Regime = 'panel' | 'espacial';

interface RegimeState {
	regime: Regime;
	activeTree: OrreryTree | null;
	lastVisitedAnchor: OrreryRef | null;
}

const initialState: RegimeState = {
	regime: 'panel',
	activeTree: null,
	lastVisitedAnchor: null
};

function resolveSeedAnchor(tree: OrreryTree, projectId: string): OrreryRef | null {
	const match = tree.anchors.find((n) => n.ref.id === projectId) ?? tree.ancestors.find((n) => n.ref.id === projectId);
	return match ? match.ref : null;
}

function rootAnchor(tree: OrreryTree): OrreryRef | null {
	return tree.anchors[0]?.ref ?? null;
}

function createRegimeStore() {
	const { subscribe, update, set } = writable<RegimeState>(initialState);

	/**
	 * Entrada A (sin seed — v0.1 §3.1.A) o Entrada B (con seed.projectId —
	 * v0.1 §3.1.B / §4.1). Si seed.projectId no resuelve a un anchor real del
	 * árbol — hoy, siempre, porque ProjectsPanel no expone evidencia de
	 * binding (Spec §1.6) — degrada a la resolución de Entrada A en vez de
	 * fabricar una Location con ese id.
	 */
	function enterEspacial(seed?: { projectId: string }): void {
		update((state) => {
			const tree = fromSimulatedData();
			let focus: OrreryRef | null = null;

			if (seed?.projectId) {
				focus = resolveSeedAnchor(tree, seed.projectId);
			}
			if (!focus) focus = state.lastVisitedAnchor;
			if (!focus) focus = rootAnchor(tree);

			return {
				regime: 'espacial',
				activeTree: tree,
				lastVisitedAnchor: focus ?? state.lastVisitedAnchor
			};
		});
	}

	function exitEspacial(): void {
		update((state) => ({ ...state, regime: 'panel' }));
	}

	/** Registra el último anchor visitado dentro de régimen Espacial — usado
	 *  por Entrada A en una entrada posterior de la misma sesión (v0.1 §3.3). */
	function recordVisited(ref: OrreryRef): void {
		update((state) => ({ ...state, lastVisitedAnchor: ref }));
	}

	function reset(): void {
		set(initialState);
	}

	return { subscribe, enterEspacial, exitEspacial, recordVisited, reset };
}

export const regimeStore = createRegimeStore();
