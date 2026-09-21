// src/adapters/fromSimulatedData.ts
//
// Envuelve el prototipo simulado existente (../data.ts: items, genes) en la
// forma real de OrreryTree — Spec_Implementacion_Integracion_Core_Orrery_v1_0.md
// §1.2. No se borra ni se modifica data.ts: sigue siendo la única fuente de
// este adaptador, y la marca "ESQUICIO 01 · DATOS SIMULADOS" que ya existe
// en main.ts línea 7 sigue siendo la señal visual de que esto es demo.
//
// `simulated: true` en el árbol resultante deja esto explícito en cualquier
// punto de consumo (nunca oculto) — ver locationTree.ts.

import { items, genes, type Item } from '../data';
import type { OrreryTree, OrreryNode, OrreryRelation, Position3 } from '../locationTree';
import type { OrreryDisplay, DisplayResolver } from '../display';

// Todos los Item del prototipo se tratan como 'user_anchor': son los
// territorios navegables del prototipo, no hay distinción de ancestro/vecino
// simulada en data.ts hoy — anchors es la categoría honesta para datos que
// no declaran ninguna estructura jerárquica propia.
function toNode(item: Item): OrreryNode {
	return {
		ref: { source: 'gravity', type: 'DOMAIN', id: item.id },
		origin: 'user_anchor'
	};
}

export function fromSimulatedData(): OrreryTree {
	return {
		locationId: null, // nunca una captura real — ver locationTree.ts
		scope: { tenantRef: null, organizationRef: null, projectRef: null },
		anchors: items.map(toNode),
		ancestors: [],
		neighbors: [],
		relations: genes.map(
			([fromId, toId]): OrreryRelation => ({ kind: 'gravity_parent', fromId, toId })
		),
		simulated: true
	};
}

/** Posiciones fijas del prototipo, preservadas 1:1 — cero regresión visual
 *  al migrar de `Item.position` embebido a la capa de layout separada. */
export function simulatedPositionHints(): Map<string, Position3> {
	const hints = new Map<string, Position3>();
	for (const item of items) hints.set(item.id, item.position);
	return hints;
}

/** Resolver de presentación del prototipo — ver display.ts para por qué
 *  este dato vive separado de OrreryTree. */
export const simulatedDisplayResolver: DisplayResolver = (id: string): OrreryDisplay | undefined => {
	const item = items.find((i) => i.id === id);
	if (!item) return undefined;
	return {
		name: item.name,
		kind: item.kind,
		project: item.project,
		color: item.color,
		description: item.description,
		detail: item.detail
	};
};
