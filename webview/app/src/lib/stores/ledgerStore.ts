// src/lib/stores/ledgerStore.ts
//
// Estado para LedgerPanel.svelte (Zona 3 — "Event Bus Feed" en
// bloom-conductor-genesis-v1_1.html, tomado como referencia de diseño, no
// de implementación: ese archivo no se edita ni se importa desde acá).
//
// PLACEHOLDER — igual que docsGate.ts: no hay canal WS/Daemon real
// conectado desde este webview todavía. `MOCK_FEED` son datos de ejemplo,
// declarados explícitamente como tales, para poder maquetar LedgerPanel
// sin bloquear en el backend. Los seis eventos reales confirmados en el
// roadmap (mandate:phase:ingest, mandate:action:started/completed/failed,
// mandate:genesis:rejected, mandate:genesis:all_complete) son el contrato
// a reemplazar esto cuando exista el consumidor real.

import { writable, derived, type Readable } from 'svelte/store';

export type FeedEventKind = 'genesis' | 'action' | 'error';

export interface FeedEntry {
	id: string;
	/** id del mandate al que pertenece este evento (placeholder: 'example' = visible para cualquier tab) */
	mandateId: string;
	time: string;
	name: string;
	kind: FeedEventKind;
	payload?: string;
}

// Datos de ejemplo — NO son eventos reales de ningún mandate. Reemplazar
// por el feed real cuando exista el canal WS consumido desde el webview.
const MOCK_FEED: FeedEntry[] = [
	{
		id: 'evt-example-1',
		mandateId: 'example',
		time: '09:41:02',
		name: 'mandate:phase:ingest',
		kind: 'genesis'
	},
	{
		id: 'evt-example-2',
		mandateId: 'example',
		time: '09:41:04',
		name: 'mandate:action:started',
		kind: 'action',
		payload: 'actionId: cluster · mode: dry_run'
	},
	{
		id: 'evt-example-3',
		mandateId: 'example',
		time: '09:41:07',
		name: 'mandate:action:completed',
		kind: 'action',
		payload: 'resultRef: domain_proposal.json'
	}
];

interface LedgerState {
	paused: boolean;
	entries: FeedEntry[];
}

function createLedgerStore() {
	const { subscribe, update } = writable<LedgerState>({
		paused: false,
		entries: MOCK_FEED
	});

	function toggleLive() {
		update((s) => ({ ...s, paused: !s.paused }));
	}

	return { subscribe, toggleLive };
}

export const ledgerStore = createLedgerStore();

/**
 * Feed filtrado para un mandate puntual. Con datos placeholder, 'example'
 * queda visible en cualquier tab de mandate para poder ver el componente
 * poblado sin depender de que mandateId matchee exactamente.
 */
export function entriesForMandate(mandateId: string): Readable<FeedEntry[]> {
	return derived(ledgerStore, ($s) =>
		$s.entries.filter((e) => e.mandateId === mandateId || e.mandateId === 'example')
	);
}
