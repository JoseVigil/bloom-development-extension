// src/display.ts
//
// Resolver de presentación — separado de OrreryTree a propósito (ver
// locationTree.ts). LocationSnapshot nunca lleva nombre, descripción ni
// color; un `OrreryRef` es identidad pura. Cualquier consumidor visual
// (hoy: main.ts) necesita resolver esos campos por otra vía — hoy esa vía
// es el propio prototipo simulado (fromSimulatedData.ts); cuando exista un
// productor real de LocationSnapshot, la vía será un resolver contra
// Gravity/Authority, con la misma forma de función.
//
// `kind` acá es un rótulo de PRESENTACIÓN (mismo vocabulario que ya usaba
// data.ts: 'Domain' | 'Posture' | 'Mandate' | 'Artifact'), deliberadamente
// distinto de `OrreryRef.type` (el NodeType real de Gravity/Authority) —
// no son el mismo eje y no se fusionan.

export interface OrreryDisplay {
	name: string;
	kind: string;
	project: string;
	color: string;
	description: string;
	detail: string;
}

export type DisplayResolver = (id: string) => OrreryDisplay | undefined;

/** Fallback explícito y honesto para un nodo sin resolver de presentación —
 *  nunca se fabrica un nombre o descripción que no existan. */
export const UNRESOLVED_DISPLAY: OrreryDisplay = {
	name: 'Sin datos de presentación',
	kind: 'Desconocido',
	project: '',
	color: '#666666',
	description: 'Este nodo no tiene un resolver de presentación conectado todavía.',
	detail: ''
};
