// src/layout.ts
//
// Separación dato/layout exigida por v0.2 §2.2 ("si una necesidad de
// presentación exige una forma distinta, se logra con una capa de layout
// sobre el árbol — nunca reconstruyendo el árbol") y por
// Spec_Implementacion_Integracion_Core_Orrery_v1_0.md §2.2.
//
// data.ts (Item.position) mezcla hoy el dato con su posición visual — ese
// acoplamiento es exactamente lo que esta capa retira de OrreryTree.
// OrreryNode no tiene campo de posición; layoutPositions() la calcula por
// fuera. `hints` permite que un adaptador (ej. fromSimulatedData) preserve
// posiciones ya conocidas sin regresión visual; un nodo sin hint recibe una
// posición por defecto explícita — no se inventa un algoritmo de layout
// real acá (fuera de alcance de la Spec, ver su §1.8).

import { allNodes, type OrreryTree } from './locationTree';

export type Position3 = [number, number, number];

export function layoutPositions(
	tree: OrreryTree,
	hints?: Map<string, Position3>
): Map<string, Position3> {
	const positions = new Map<string, Position3>();
	for (const node of allNodes(tree)) {
		positions.set(node.ref.id, hints?.get(node.ref.id) ?? [0, 0, 0]);
	}
	return positions;
}
