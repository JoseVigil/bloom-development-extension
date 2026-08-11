// src/lib/stores/mandateStore.ts
//
// Estado para MandateTab.svelte — el componente único que reemplaza la
// distinción GenesisTab/StandardMandateTab (no existía como código real,
// solo como comentarios TODO — ver routes/genesis/+page.svelte y
// Sidebar.svelte previos a esta consolidación). Genesis pasa a ser un
// `mandateType` más, no un componente aparte.
//
// PLACEHOLDER — mismo patrón que docsGate.ts: `nucleus mandate genesis`
// (la creación real del mandate) no se dispara desde esta UI. `createMandate`
// de acá arma un registro local con datos de ejemplo para que MandateTab
// tenga algo que mostrar apenas se abre un tab nuevo. Reemplazar por la
// hidratación real (API/bridge) cuando exista el endpoint correspondiente.

import { writable, derived, type Readable } from 'svelte/store';

export type MandateType = 'genesis' | 'domain_expansion' | 'standard';
export type DomainBaseline = 'empty' | 'existing';
export type MandatePhase = 'ingest' | 'cluster' | 'validate' | 'scaffold';
export type MandateStatus = 'building' | 'waiting' | 'running' | 'completed' | 'failed';

export interface MandateData {
	mandateId: string;
	title: string;
	mandateType: MandateType;
	domainBaseline: DomainBaseline;
	phase: MandatePhase;
	status: MandateStatus;
}

interface MandateStoreState {
	byId: Record<string, MandateData>;
}

let counter = 0;

function createMandateStore() {
	const { subscribe, update } = writable<MandateStoreState>({ byId: {} });

	/**
	 * Crea un mandate placeholder local y lo registra en el store. No pega
	 * contra backend — ver nota de cabecera. `title` es opcional porque
	 * hoy no hay ningún flujo (modal, etc.) que pida nombre de proyecto
	 * antes de abrir el tab; si eso se agrega en un paso posterior, el
	 * caller puede pasarlo.
	 */
	function createMandate(input: {
		mandateType: MandateType;
		domainBaseline: DomainBaseline;
		title?: string;
	}): MandateData {
		counter += 1;
		const mandateId = `mandate-placeholder-${Date.now()}-${counter}`;
		const mandate: MandateData = {
			mandateId,
			title: input.title ?? 'Nuevo Mandate',
			mandateType: input.mandateType,
			domainBaseline: input.domainBaseline,
			phase: 'ingest',
			status: 'building'
		};
		update((s) => ({ byId: { ...s.byId, [mandateId]: mandate } }));
		return mandate;
	}

	return { subscribe, createMandate };
}

export const mandateStore = createMandateStore();

export function mandateById(mandateId: string): Readable<MandateData | undefined> {
	return derived(mandateStore, ($s) => $s.byId[mandateId]);
}
