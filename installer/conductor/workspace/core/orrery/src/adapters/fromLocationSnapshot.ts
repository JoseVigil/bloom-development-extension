// src/adapters/fromLocationSnapshot.ts
//
// Ruta real, sin caller productivo todavía — Spec_Implementacion_Integracion_Core_Orrery_v1_0.md
// §0 y §1.2. No existe hoy ningún productor de LocationSnapshot en el
// backend (ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md §1: "Location permanece
// NOT_SUPPORTED de extremo a extremo"; encargos B1-B3/A1-A2 de esa misma
// Closure §13 son la condición de existencia de este adaptador).
//
// Se declara la firma ahora, con el tipo de entrada sin comprometerse a una
// forma que todavía no está implementada en ningún lado del repo — para no
// inventar un contrato que compita con el JSON Schema real de
// Orrery_LocationSnapshot_v0.md §E cuando se materialice. El día que exista
// un productor real, este archivo es el único que cambia: ni OrreryTree, ni
// main.ts, ni el mecanismo de montaje necesitan tocarse (ver Spec §0).

import type { OrreryTree } from '../locationTree';

/**
 * Placeholder deliberado — lanza en vez de devolver un árbol fabricado.
 * Aceptar `unknown` y fallar explícitamente es más honesto que declarar un
 * tipo `LocationSnapshot` que todavía no tiene una fuente real que lo emita.
 */
export function fromLocationSnapshot(_snapshot: unknown): OrreryTree {
	throw new Error(
		'fromLocationSnapshot: sin productor real de LocationSnapshot todavía — ' +
			'ver docs/ANALYSIS/ORRERY/LOCATION/ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md §13 ' +
			'(encargos B1-B3/A1-A2 pendientes).'
	);
}
