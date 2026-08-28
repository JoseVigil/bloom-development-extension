<script lang="ts">
  // src/lib/components/MandateTab.svelte
  //
  // Componente único y genérico para el contenido de un tab de mandate.
  // Reemplaza la distinción GenesisTab/StandardMandateTab: esa frontera
  // nunca existió como código real (solo como comentarios TODO en
  // routes/genesis/+page.svelte y Sidebar.svelte), así que no hay nada
  // que migrar salvo el contenido de esa ruta. Genesis es hoy
  // mandateType: 'genesis', no un componente aparte.
  //
  // Impulsado por estado: `mandateType` ('genesis' | 'domain_expansion' |
  // 'standard') y `domainBaseline` ('empty' | 'existing') vienen de
  // mandateStore.ts (placeholder — ver ahí). NINGUNA rama de código por
  // mandateType acá: solo variaciones leves de copy según domainBaseline,
  // como pide el prompt de consolidación.
  //
  // Contenido:
  //   1. Picker de Capa 0 — migrado 1:1 (mismo store docsGate.ts, mismo
  //      comportamiento) desde routes/genesis/+page.svelte.
  //   2. Ciclo de vida de 4 fases (ingest/cluster/validate/scaffold) —
  //      estructura y tokens de referencia visual tomados de
  //      bloom-conductor-genesis-v1_1.html (.g-card/.g-badge/.g-bar-*),
  //      SIN editar ni importar ese archivo.

  import { onMount } from 'svelte';
  import { docsGate, hasAnyDocs } from '$lib/stores/docsGate';
  import { mandateById, type MandatePhase } from '$lib/stores/mandateStore';

  export let mandateId: string;

  $: mandate = mandateById(mandateId);

  let dragActive = false;

  onMount(() => {
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

  const PHASES: { id: MandatePhase; label: string }[] = [
    { id: 'ingest', label: 'Ingesta' },
    { id: 'cluster', label: 'Clustering' },
    { id: 'validate', label: 'Validación' },
    { id: 'scaffold', label: 'Scaffold' }
  ];

  function phaseState(phaseId: MandatePhase, currentPhase: MandatePhase): 'done' | 'current' | 'pending' {
    const order = PHASES.map((p) => p.id);
    const idxCurrent = order.indexOf(currentPhase);
    const idxPhase = order.indexOf(phaseId);
    if (idxPhase < idxCurrent) return 'done';
    if (idxPhase === idxCurrent) return 'current';
    return 'pending';
  }
</script>

{#if $mandate}
  <div class="mandate-tab">
    <header class="mandate-header">
      <span class="eyebrow">Mandate · {$mandate.mandateType}</span>
      <h1>{$mandate.title}</h1>
      {#if $mandate.domainBaseline === 'empty'}
        <p class="subtitle">
          Este dominio arranca vacío — todavía no hay código base. Fase 1 va a
          leer lo que subas o lo que se detecte acá abajo.
        </p>
      {:else}
        <p class="subtitle">
          Este dominio ya tiene código base existente. Fase 1 va a analizarlo
          junto con cualquier documentación adicional que sumes acá.
        </p>
      {/if}
    </header>

    <section class="panel">
      <h2>Ciclo de vida</h2>
      <ol class="phase-list">
        {#each PHASES as phase (phase.id)}
          {@const state = phaseState(phase.id, $mandate.phase)}
          <li class="phase-item" class:done={state === 'done'} class:current={state === 'current'}>
            <span class="phase-dot" class:running={state === 'current' && $mandate.currentStatus !== 'failed'} class:failed={state === 'current' && $mandate.currentStatus === 'failed'} />
            <span class="phase-label">{phase.label}</span>
            {#if state === 'current'}
              <span class="phase-badge status-{$mandate.currentStatus}">{$mandate.currentStatus}</span>
            {/if}
          </li>
        {/each}
      </ol>
    </section>

    <section class="panel">
      <h2>Documentación del proyecto</h2>
      <p class="hint">
        El mandate ya existe. Esto prepara el material que Fase 1 va a leer —
        no arranca ni pausa nada por sí mismo todavía.
      </p>

      <div class="sub-panel">
        <h3>Detectada en el proyecto</h3>
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
      </div>

      <div
        class="sub-panel dropzone"
        class:active={dragActive}
        on:dragover|preventDefault={() => (dragActive = true)}
        on:dragleave={() => (dragActive = false)}
        on:drop={handleDrop}
      >
        <h3>Agregar más</h3>
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
      </div>

      <footer class="picker-footer">
        <button class="btn-continue" disabled={!$hasAnyDocs} on:click={handleContinue}>
          Continuar
        </button>
        <!--
          Nota visible a propósito, migrada tal cual desde
          routes/genesis/+page.svelte: mientras Q-06/Q-07 no se resuelvan,
          este botón no controla el arranque real de Fase 1.
        -->
        {#if $docsGate.continuePressed && !$docsGate.docsReadyConfirmed}
          <p class="gate-note">
            Fase 1 puede haber arrancado ya o arrancar en cualquier momento —
            el gate que lo evita todavía no existe del lado del sistema.
          </p>
        {/if}
      </footer>
    </section>
  </div>
{:else}
  <div class="mandate-tab">
    <p class="hint">No se encontró data para este mandate ({mandateId}).</p>
  </div>
{/if}

<style>
  .mandate-tab {
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

    max-width: 680px;
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
    max-width: 52ch;
  }

  .panel {
    margin-top: var(--space-md);
    padding: var(--space-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    animation: fadeInUp 0.3s var(--ease-system) both;
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .panel h2 {
    font-family: var(--font-display);
    font-size: 15px;
    margin: 0 0 var(--space-sm);
  }

  .sub-panel {
    margin-top: var(--space-sm);
  }

  .sub-panel h3 {
    font-family: var(--font-display);
    font-size: 13px;
    color: var(--color-text-secondary);
    margin: 0 0 6px;
  }

  .hint {
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  .hint.error {
    color: var(--color-error);
  }

  /* ── Fases ── */
  .phase-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .phase-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--color-surface-hover);
    opacity: 0.5;
  }

  .phase-item.done {
    opacity: 0.75;
  }

  .phase-item.current {
    opacity: 1;
    border: 1px solid var(--color-border-active);
  }

  .phase-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--color-text-dim);
  }

  .phase-item.done .phase-dot {
    background: var(--color-accent);
  }

  .phase-dot.running {
    background: var(--color-accent);
    box-shadow: 0 0 8px rgba(200, 245, 90, 0.4);
    animation: pulse-dot 2s ease-in-out infinite;
  }

  .phase-dot.failed {
    background: var(--color-error);
    box-shadow: 0 0 8px rgba(255, 68, 68, 0.4);
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .phase-label {
    font-family: var(--font-display);
    font-size: 13px;
    color: var(--color-text-primary);
  }

  .phase-badge {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.12em;
    padding: 2px 7px;
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    background: var(--color-accent-dim);
    color: var(--color-accent);
  }

  .phase-badge.status-failed {
    background: var(--color-error-dim);
    color: var(--color-error);
  }

  /* ── Doc list (Picker de Capa 0, migrado) ── */
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
    border: 1px dashed var(--color-border);
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
    transition: border-color var(--duration-base) var(--ease-system),
      background var(--duration-base) var(--ease-system);
  }

  .dropzone.active {
    border-color: var(--color-border-active);
    background: var(--color-accent-dim);
  }

  .picker-footer {
    margin-top: var(--space-md);
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
    max-width: 52ch;
  }
</style>
