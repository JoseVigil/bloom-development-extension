<!--
  src/routes/genesis/+page.svelte

  TODO: confirmar Q-03 — no tengo el contenido actual de este archivo (no
  fue subido a esta sesión, solo su existencia en webview_tree.txt). Este
  layout está pensado para reemplazar/extender lo que haya ahí, no para
  pisarlo a ciegas. Confirmar antes de mergear.

  TODO: confirmar Q-04 — este componente no usa window.nucleus. Si el
  bridge (D-01/D-02/D-05) se arregla antes de que esto se construya de
  verdad, hay que decidir si esta pantalla pasa a leer nucleus.json vía
  bridge en vez de vía API Fastify.

  Contexto de alcance (no repetir el diseño de layout como si resolviera
  esto): el Genesis Mandate ya existe al montar esta pantalla. Este
  componente NO controla cuándo arranca Fase 1 — ver docsGate.ts,
  markContinuePressed().
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { docsGate, hasAnyDocs } from '$lib/stores/docsGate';
	// TODO: confirmar shape real de nucleus.json store (`$lib/stores/onboarding.ts`
	// existe en webview_tree.txt pero no se leyó su contenido en esta sesión).
	// Se asume que expone algo equivalente a lo de abajo.
	// import { onboarding } from '$lib/stores/onboarding';

	let dragActive = false;

	onMount(() => {
		// TODO: reemplazar por el store real de onboarding una vez confirmado.
		// docsGate.hydrate($onboarding.project_path, $onboarding.genesis_mandate_id);
		docsGate.scanDetectedDocs(fetch);
	});

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragActive = false;
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			docsGate.uploadFiles(Array.from(files), fetch);
		}
	}

	function handleContinue() {
		docsGate.markContinuePressed(fetch);
	}
</script>

<div class="picker">
	<header class="picker-header">
		<span class="eyebrow">Genesis · Capa 1</span>
		<h1>Documentación del proyecto</h1>
		<p class="subtitle">
			Este mandate ya existe. Esto prepara el material que Fase 1 va a
			leer — no arranca ni pausa nada por sí mismo todavía.
		</p>
	</header>

	<section class="panel">
		<h2>Detectada en el proyecto</h2>
		{#if $docsGate.detectedStatus === 'loading'}
			<p class="hint">Buscando README.md, docs/ y similares…</p>
		{:else if $docsGate.detectedStatus === 'error'}
			<p class="hint error">{$docsGate.detectedError}</p>
		{:else if $docsGate.detectedDocs.length === 0}
			<p class="hint">No se encontró documentación existente en el proyecto.</p>
		{:else}
			<ul class="doc-list">
				{#each $docsGate.detectedDocs as doc (doc.relPath)}
					<li>
						<span class="doc-name">{doc.name}</span>
						<span class="doc-path">{doc.relPath}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section
		class="panel dropzone"
		class:active={dragActive}
		on:dragover|preventDefault={() => (dragActive = true)}
		on:dragleave={() => (dragActive = false)}
		on:drop={handleDrop}
	>
		<h2>Agregar más</h2>
		<p class="hint">Arrastrá archivos acá para sumarlos al proyecto.</p>
		{#if $docsGate.uploadStatus === 'error'}
			<p class="hint error">{$docsGate.uploadError}</p>
		{/if}
		{#if $docsGate.uploadedDocs.length > 0}
			<ul class="doc-list">
				{#each $docsGate.uploadedDocs as doc (doc.name)}
					<li>
						<span class="doc-name">{doc.name}</span>
						<span class="doc-status" class:done={doc.status === 'done'} class:error={doc.status === 'error'}>
							{doc.status}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<footer class="picker-footer">
		<button
			class="btn-continue"
			disabled={!$hasAnyDocs}
			on:click={handleContinue}
		>
			Continuar
		</button>
		<!--
			Nota visible a propósito, no oculta en un comentario: mientras
			Q-06/Q-07 no se resuelvan, este botón no controla el arranque
			real de Fase 1. Sacar esta línea recién cuando el gate de
			backend exista y esté confirmado end-to-end.
		-->
		{#if $docsGate.continuePressed && !$docsGate.docsReadyConfirmed}
			<p class="gate-note">
				Fase 1 puede haber arrancado ya o arrancar en cualquier momento —
				el gate que lo evita todavía no existe del lado del sistema.
			</p>
		{/if}
	</footer>
</div>

<style>
	.picker {
		--color-bg: #080a0e;
		--color-surface: #0d1117;
		--color-surface-hover: #131820;
		--color-text-primary: #e8eaf0;
		--color-text-secondary: rgba(232, 234, 240, 0.45);
		--color-text-dim: rgba(232, 234, 240, 0.22);
		--color-border: rgba(255, 255, 255, 0.06);
		--color-border-active: rgba(255, 255, 255, 0.18);
		--color-accent: #c8f55a;
		--color-accent-dim: rgba(200, 245, 90, 0.12);
		--color-error: #ff4444;
		--color-error-dim: rgba(255, 68, 68, 0.12);
		--font-display: 'Syne', sans-serif;
		--font-mono: 'DM Mono', monospace;
		--space-xs: 8px;
		--space-sm: 12px;
		--space-md: 24px;
		--space-lg: 40px;
		--radius-sm: 2px;
		--radius-md: 4px;
		--duration-base: 300ms;
		--ease-system: cubic-bezier(0.4, 0, 0.2, 1);

		max-width: 640px;
		margin: 0 auto;
		padding: var(--space-lg) var(--space-md);
		color: var(--color-text-primary);
		font-family: var(--font-mono);
	}

	.eyebrow {
		font-family: var(--font-mono);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-accent);
	}

	h1 {
		font-family: var(--font-display);
		font-size: 28px;
		margin: var(--space-xs) 0;
	}

	.subtitle {
		color: var(--color-text-secondary);
		font-size: 13px;
		line-height: 1.5;
		max-width: 46ch;
	}

	.panel {
		margin-top: var(--space-md);
		padding: var(--space-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.panel h2 {
		font-family: var(--font-display);
		font-size: 15px;
		margin: 0 0 var(--space-sm);
	}

	.hint {
		color: var(--color-text-secondary);
		font-size: 13px;
	}

	.hint.error {
		color: var(--color-error);
	}

	.doc-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.doc-list li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: var(--space-xs) var(--space-sm);
		background: var(--color-surface-hover);
		border-radius: var(--radius-sm);
		font-size: 13px;
	}

	.doc-name {
		color: var(--color-text-primary);
	}

	.doc-path,
	.doc-status {
		color: var(--color-text-dim);
		font-size: 11px;
	}

	.doc-status.done {
		color: var(--color-accent);
	}

	.doc-status.error {
		color: var(--color-error);
	}

	.dropzone {
		border-style: dashed;
		transition: border-color var(--duration-base) var(--ease-system),
			background var(--duration-base) var(--ease-system);
	}

	.dropzone.active {
		border-color: var(--color-border-active);
		background: var(--color-accent-dim);
	}

	.picker-footer {
		margin-top: var(--space-lg);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-xs);
	}

	.btn-continue {
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.02em;
		color: var(--color-bg);
		background: var(--color-accent);
		border: none;
		border-radius: var(--radius-sm);
		padding: var(--space-xs) var(--space-md);
		cursor: pointer;
		transition: opacity var(--duration-base) var(--ease-system);
	}

	.btn-continue:disabled {
		background: var(--color-surface-hover);
		color: var(--color-text-dim);
		cursor: not-allowed;
	}

	.gate-note {
		color: var(--color-text-dim);
		font-size: 11px;
		max-width: 46ch;
	}
</style>
