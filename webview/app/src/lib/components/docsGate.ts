// src/lib/stores/docsGate.ts
//
// Estado para la pantalla de "picker de Capa 1" (ver
// prompt-picker-capa1-frontend-v2.md). Esta pantalla NO es un paso previo a
// que exista un mandateId — el Genesis Mandate ya fue creado durante
// onboarding (confirmado en nucleus.json: onboarding.genesis_mandate_id +
// "mandate_genesis" en completed_steps, y en mandate.go: createGenesisMandate
// escribe mandate_state.json con currentPhase "ingest" / status "pending"
// desde el primer instante).
//
// mandate_watcher.go dispara MandateGenesisBuildWorkflow apenas ve esa
// condición, sin esperar ningún botón de esta pantalla. Por eso el flag
// docsReadyRequested de más abajo es DELIBERADAMENTE optimista: no bloquea
// nada por sí mismo hasta que exista un gate del lado de mandate_watcher.go
// (Q-06/Q-07, todavía sin resolver — ver prompt v2, sección "Hallazgo que
// cambia el alcance").

import { writable, derived, type Readable } from 'svelte/store';

// ── tipos ────────────────────────────────────────────────────────────────

export type DetectedDoc = {
	/** Path relativo a project_path, ej. "README.md" o "docs/architecture.md" */
	relPath: string;
	name: string;
	kind: 'readme' | 'docs-dir-entry' | 'other';
};

export type UploadedDoc = {
	name: string;
	status: 'uploading' | 'done' | 'error';
	error?: string;
};

export type DocsGateState = {
	/** onboarding.project_path — shape confirmado en nucleus.json real */
	projectPath: string | null;
	/** onboarding.genesis_mandate_id — el mandate YA existe al llegar acá */
	mandateId: string | null;

	detectedDocs: DetectedDoc[];
	detectedStatus: 'idle' | 'loading' | 'loaded' | 'error';
	detectedError: string | null;

	uploadedDocs: UploadedDoc[];
	uploadStatus: 'idle' | 'uploading' | 'error';
	uploadError: string | null;

	/**
	 * true una vez que el usuario apretó "continuar". Es intención del
	 * usuario, no confirmación del backend — ver docsReadyConfirmed.
	 */
	continuePressed: boolean;

	/**
	 * true solo si el endpoint que marca el gate (hoy inexistente) devuelve
	 * 200. Mientras ese endpoint no exista, este campo debe quedarse en
	 * `false` para siempre — NO simular que se confirmó.
	 *
	 * TODO: confirmar Q-06 — ¿quién es dueño del ticket de backend
	 * (campo `docsReady` en mandate_state.json + condición nueva en
	 * mandate_watcher.go)? Sin eso, este campo no tiene contraparte real
	 * que lo setee en `true`.
	 */
	docsReadyConfirmed: boolean;
};

const initialState: DocsGateState = {
	projectPath: null,
	mandateId: null,
	detectedDocs: [],
	detectedStatus: 'idle',
	detectedError: null,
	uploadedDocs: [],
	uploadStatus: 'idle',
	uploadError: null,
	continuePressed: false,
	docsReadyConfirmed: false
};

function createDocsGateStore() {
	const { subscribe, set, update } = writable<DocsGateState>(initialState);

	return {
		subscribe,

		/**
		 * Hidrata projectPath/mandateId desde nucleus.json. En este webview
		 * eso no llega por `fs` directo (no confirmado — ver prompt v2,
		 * "Contexto arquitectónico") sino por lo que exponga el bridge o la
		 * API Fastify — cuál de los dos es una pregunta de wiring, no de
		 * shape, y el shape ya está confirmado.
		 */
		hydrate(projectPath: string, mandateId: string) {
			update((s) => ({ ...s, projectPath, mandateId }));
		},

		/**
		 * TODO: confirmar Q-02 (ya resuelta en negativo en v2, dejar
		 * explícito acá igual) — este método asume un endpoint nuevo
		 * `GET /api/project/docs?path=...` que hoy NO existe en el swagger
		 * de la API Fastify (:48215). No implementar la llamada real hasta
		 * que ese endpoint exista; el shape de DetectedDoc de arriba es la
		 * propuesta de contrato, no un contrato confirmado.
		 */
		async scanDetectedDocs(_fetchImpl: typeof fetch) {
			update((s) => ({ ...s, detectedStatus: 'loading', detectedError: null }));
			// TODO: reemplazar por llamada real una vez exista el endpoint.
			// const res = await _fetchImpl(`/api/project/docs?path=${encodeURIComponent(projectPath)}`);
			update((s) => ({
				...s,
				detectedStatus: 'error',
				detectedError: 'Endpoint GET /api/project/docs todavía no existe en la API Fastify.'
			}));
		},

		/**
		 * TODO: mismo caveat que scanDetectedDocs — asume
		 * `POST /api/project/docs/upload`, inexistente hoy. Del lado
		 * backend, mandate.go ya tiene una función reusable para esto:
		 * copyDocsInto(mandateDir, docs) (ver mandate.go, usada hoy por
		 * `mandate genesis --docs`) — el endpoint nuevo debería reusarla en
		 * vez de reimplementar el copiado, aunque el destino acá sea
		 * {project_path}/.bloom-docs/ y no {mandatesRoot}/{id}/docs/.
		 */
		async uploadFiles(_files: File[], _fetchImpl: typeof fetch) {
			update((s) => ({ ...s, uploadStatus: 'uploading', uploadError: null }));
			update((s) => ({
				...s,
				uploadStatus: 'error',
				uploadError: 'Endpoint POST /api/project/docs/upload todavía no existe en la API Fastify.'
			}));
		},

		/**
		 * Se llama al apretar "continuar". NO dispara Fase 1 — Fase 1 ya
		 * pudo haber arrancado desde onboarding (ver mandate_watcher.go).
		 * Marca la intención del usuario localmente y, cuando exista el
		 * endpoint del gate, intentaría setear docsReady:true en
		 * mandate_state.json. Hasta entonces, es un no-op de negocio real
		 * disfrazado de botón — dejarlo así de explícito en vez de fingir
		 * que bloquea algo.
		 *
		 * TODO: confirmar Q-07 — mientras el gate no exista, ¿esta pantalla
		 * se muestra igual (best-effort) o no se construye/monta hasta que
		 * el gate esté confirmado? Este store asume que sí se muestra
		 * (best-effort) porque así lo pidió esta sesión, pero es decisión
		 * de producto pendiente, no un hecho.
		 */
		async markContinuePressed(_fetchImpl: typeof fetch) {
			update((s) => ({ ...s, continuePressed: true }));
			// TODO: cuando exista el gate:
			// const res = await _fetchImpl(`/api/mandate/${mandateId}/docs-ready`, { method: 'POST' });
			// update((s) => ({ ...s, docsReadyConfirmed: res.ok }));
		},

		reset() {
			set(initialState);
		}
	};
}

export const docsGate = createDocsGateStore();

/** Deriva si ya hay algo mostrable (detectado o subido) para habilitar "continuar". */
export const hasAnyDocs: Readable<boolean> = derived(
	docsGate,
	($s) => $s.detectedDocs.length > 0 || $s.uploadedDocs.some((d) => d.status === 'done')
);
