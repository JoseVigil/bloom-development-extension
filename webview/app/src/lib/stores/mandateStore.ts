// src/lib/stores/mandateStore.ts
//
// Estado para MandateTab.svelte — el componente único que reemplaza la
// distinción GenesisTab/StandardMandateTab (no existía como código real,
// solo como comentarios TODO — ver routes/genesis/+page.svelte y
// Sidebar.svelte previos a esta consolidación). Genesis pasa a ser un
// `mandateType` más, no un componente aparte.
//
// CAMBIO (implementación post Mandate_Event_Mechanism_Auditoria_v1.md,
// frente 3): deja de ser un placeholder puro. `createMandate()` (local,
// sin backend) se mantiene tal cual para el flujo de "Nuevo Mandate" desde
// TabBar — sigue sin pegar contra backend, eso no era parte de este pedido.
// Lo que se agrega es la hidratación con datos reales:
//   - `hydrateFromList()`: consume el resultado de `listMandates()`
//     (catch-up al montar, GET /api/v1/mandates).
//   - `applyMandateEvent()`: consume cualquier evento `mandate:*` que
//     llegue por `websocketStore` (ver +layout.svelte) y actualiza (o crea,
//     si todavía no existía en el store) la entrada correspondiente.
// Ambas rutas conviven con la de placeholder porque el mandateId es la
// clave del store en los tres casos — si un placeholder local y un mandate
// real terminaran compartiendo id sería una colisión, pero eso no puede
// pasar: los ids reales vienen de randomUUID()/uuid.New() del backend, los
// placeholders usan el prefijo `mandate-placeholder-`.

import { writable, derived, type Readable } from 'svelte/store';

export type MandateType = 'genesis' | 'domain_expansion' | 'standard';
export type DomainBaseline = 'empty' | 'existing';
export type MandatePhase = 'ingest' | 'cluster' | 'validate' | 'scaffold';
// 'draft' (standard sin confirmar) y 'pending' (genesis firmado, esperando
// que Temporal arranque el scaffold — ver comentario de mandate:genesis:signed
// en ws-events.ts: mandate_state.json pasa "building" → "pending" → "running")
// se agregan acá porque son estados reales que puede reportar el backend,
// no existían en el placeholder original.
export type MandateStatus = 'draft' | 'building' | 'pending' | 'waiting' | 'running' | 'completed' | 'failed';

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

/** Forma mínima que necesita hydrateFromList — subset de MandateSummary (api.ts) para no acoplar el store al tipo exacto de la respuesta HTTP. */
interface ListedMandate {
	mandateId: string;
	mandateType?: string;
	project?: string;
	name?: string;
	status?: string;
	currentPhase?: string;
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

	/**
	 * Crea o actualiza (merge parcial) la entrada de un mandate real. Usada
	 * tanto por hydrateFromList() como por applyMandateEvent() — ambas
	 * necesitan "upsert", no "replace": un evento tardío no debe pisar
	 * campos que el catch-up ya pobló y el evento no toca (ej. `project`).
	 */
	function upsert(mandateId: string, patch: Partial<Omit<MandateData, 'mandateId'>>): void {
		update((s) => {
			const existing = s.byId[mandateId];
			const merged: MandateData = {
				mandateId,
				title: patch.title ?? existing?.title ?? mandateId,
				mandateType: patch.mandateType ?? existing?.mandateType ?? 'genesis',
				domainBaseline: patch.domainBaseline ?? existing?.domainBaseline ?? 'empty',
				phase: patch.phase ?? existing?.phase ?? 'ingest',
				status: patch.status ?? existing?.status ?? 'building'
			};
			return { byId: { ...s.byId, [mandateId]: merged } };
		});
	}

	/**
	 * Catch-up: puebla el store con lo que ya existe en disco al montar
	 * Core (GET /api/v1/mandates). No decide qué se abre como tab — eso lo
	 * resuelve el caller (+layout.svelte) con el resultado crudo de la API,
	 * este método solo asegura que el store tenga la data disponible para
	 * cuando se abra el tab.
	 */
	function hydrateFromList(items: ListedMandate[]): void {
		for (const item of items) {
			upsert(item.mandateId, {
				title: item.name || item.project || item.mandateId,
				mandateType: (item.mandateType as MandateType) || 'genesis',
				domainBaseline: 'empty',
				phase: (item.currentPhase as MandatePhase) || 'ingest',
				status: (item.status as MandateStatus) || 'building'
			});
		}
	}

	/**
	 * Traduce un evento `mandate:*` (payload real, ver src/types/ws-events.ts
	 * del lado server) a un patch de MandateData. Cubre los 10 eventos que
	 * hoy existen en WsEventMap — ver ese archivo para el detalle de cada
	 * payload. Eventos desconocidos (futuros, o typos) son no-op explícito,
	 * no rompen nada.
	 *
	 * mandateId ausente en el payload es un evento inválido — se descarta
	 * con un warning en vez de crear una entrada sin id real.
	 */
	function applyMandateEvent(event: string, data: any): void {
		const mandateId = data?.mandateId;
		if (!mandateId) {
			console.warn('[mandateStore] evento mandate:* sin mandateId, se ignora:', event, data);
			return;
		}

		switch (event) {
			case 'mandate:genesis:initiated':
				upsert(mandateId, {
					title: data.projectName || mandateId,
					mandateType: 'genesis',
					phase: 'ingest',
					status: 'building'
				});
				break;

			case 'mandate:draft:created':
				upsert(mandateId, {
					title: data.projectName || mandateId,
					mandateType: (data.mandateType as MandateType) || 'standard',
					status: 'draft'
				});
				break;

			case 'mandate:genesis:ingest_progress':
				upsert(mandateId, { phase: 'ingest', status: 'building' });
				break;

			case 'mandate:genesis:ingest_complete':
				upsert(mandateId, { phase: 'cluster', status: 'building' });
				break;

			case 'mandate:genesis:domains_proposed':
				// Fase 3 — punto de sincronización humana, esperando confirmación.
				upsert(mandateId, { phase: 'validate', status: 'waiting' });
				break;

			case 'mandate:genesis:signed':
				// mandate.json firmado. mandate_state.json pasa building → pending
				// (ver ws-events.ts) — todavía no arrancó el scaffold en sí.
				upsert(mandateId, { phase: 'scaffold', status: 'pending' });
				break;

			case 'mandate:genesis:error':
				upsert(mandateId, { status: 'failed' });
				break;

			case 'mandate:action:started':
				upsert(mandateId, { phase: 'scaffold', status: 'running' });
				break;

			case 'mandate:action:completed':
				// Un dominio individual completó — no todos. No se toca el status
				// del mandate acá; mandate:action:all_complete es quien decide eso.
				break;

			case 'mandate:action:failed':
				upsert(mandateId, { status: 'failed' });
				break;

			case 'mandate:action:all_complete':
				upsert(mandateId, { status: 'completed' });
				break;

			default:
				// Evento mandate:* desconocido (futuro o no mapeado) — no-op.
				break;
		}
	}

	return { subscribe, createMandate, hydrateFromList, applyMandateEvent };
}

export const mandateStore = createMandateStore();

export function mandateById(mandateId: string): Readable<MandateData | undefined> {
	return derived(mandateStore, ($s) => $s.byId[mandateId]);
}
