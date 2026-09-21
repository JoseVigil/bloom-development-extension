// src/locationTree.ts
//
// Espejo TypeScript literal de LocationSnapshot v0.1 (§D de
// docs/ANALYSIS/ORRERY/LOCATION/Orrery_LocationSnapshot_v0.md), campo por
// campo, sin renombrar ni aplanar — v0.2 §2.2 del cowork de diseño
// ("proyección 1:1, sin transformación de forma") y
// Spec_Implementacion_Integracion_Core_Orrery_v1_0.md §2.1.
//
// Nota (Spec §0): LocationSnapshot es un contrato ya aprobado pero sin
// productor real todavía (ver ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md §1,
// "NOT_SUPPORTED de extremo a extremo"). Este archivo define la forma
// contra la que se construye el cliente; no implica que exista hoy una
// fuente real que la produzca — ver adapters/fromLocationSnapshot.ts.
//
// Deliberadamente NO incluye campos de presentación (nombre, descripción,
// color) — LocationSnapshot tampoco los tiene (Orrery_LocationSnapshot_v0.md
// §D: "Cada `ref` contiene identidad, fuente y evidencia observada", nunca
// contenido). Esos campos viven en un resolver de presentación separado —
// ver ./display.ts — igual que en una implementación real harían falta
// resolvers de nombre por separado (Gravity, Authority, etc.), nunca
// embebidos en la captura de Location.

export type OrreryOrigin = 'user_anchor' | 'structural_ancestor' | 'direct_relation';

export type OrreryNodeType =
	| 'TENANT'
	| 'ORGANIZATION'
	| 'PROJECT'
	| 'NUCLEUS'
	| 'MANDATE'
	| 'SESSION'
	| 'DOMAIN'
	| 'GENE';

export interface OrreryRef {
	source: 'gravity' | 'authority';
	type: OrreryNodeType;
	id: string;
	/** Solo presente para refs `gravity` — LocationSnapshot v0.1 §E, gravityRef.evidence.node_version. */
	nodeVersion?: number;
}

export interface OrreryNode {
	ref: OrreryRef;
	origin: OrreryOrigin;
}

export interface OrreryRelation {
	kind: 'gravity_structural_edge' | 'gravity_parent';
	/** ids de los dos extremos, tal cual figuran en `relations[]` de LocationSnapshot. */
	fromId: string;
	toId: string;
}

export interface OrreryTree {
	/** null solo en el adaptador simulado (adapters/fromSimulatedData.ts) — nunca en datos reales. */
	locationId: string | null;
	scope: {
		tenantRef: OrreryRef | null;
		organizationRef: OrreryRef | null;
		projectRef: OrreryRef | null;
	};
	anchors: OrreryNode[]; // origin siempre 'user_anchor'
	ancestors: OrreryNode[]; // origin siempre 'structural_ancestor'
	neighbors: OrreryNode[]; // origin siempre 'direct_relation'
	relations: OrreryRelation[];
	/** true solo para fromSimulatedData() — nunca oculto a quien consume el árbol. */
	simulated: boolean;
}

/** Recorre anchors+ancestors+neighbors — el mismo tipo de recorrido que hoy hace
 *  `for (const item of items)` sobre la lista plana de data.ts, aplicado a las
 *  tres colecciones tipadas de OrreryTree. Usado tanto para renderizar como para
 *  diffing (ver adapters y main.ts::update()). */
export function allNodes(tree: OrreryTree): OrreryNode[] {
	return [...tree.anchors, ...tree.ancestors, ...tree.neighbors];
}
