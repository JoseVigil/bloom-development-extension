<!--
  Wisdom — oferta de Mandate.
  Entrar, navegar o recargar sólo lee: catálogo remoto (sin bytes), instalaciones
  locales y elegibilidad de proyectos, por separado. Instalar y preparar son
  dos gestos explícitos. Ninguna navegación aprueba, activa ni ejecuta.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    readOffers, readInstallations, readProjects, readProjectFiles, installOffer, prepareOffer,
    rowState, reasonText, preparationText, shortDigest,
    type Offer, type InstalledInstance, type ProjectEligibility, type Failure
  } from '$lib/wisdomOffer';

  let offers: Offer[] = [];
  let offersError: Failure | null = null;
  let installations: InstalledInstance[] = [];
  let installationsError: Failure | null = null;
  let projects: ProjectEligibility[] = [];
  let projectsError: Failure | null = null;
  let loading = true;

  // Confirmación explícita: oferta + proyecto elegidos, todavía sin instalar.
  let pending: { offer: Offer; project: ProjectEligibility } | null = null;
  let installing = false;
  let installError: Failure | null = null;
  let pendingPrepare: { offer: Offer; project: ProjectEligibility; installation: InstalledInstance; files: string[] } | null = null;
  let selectedInputs: string[] = [];
  let preparing = false;
  let prepareError: Failure | null = null;

  async function refreshInstallations() {
    const r = await readInstallations();
    if (r.ok) { installations = r.value; installationsError = null; } else installationsError = r.error;
  }

  async function load() {
    loading = true;
    const [o, i, p] = await Promise.all([readOffers(), readInstallations(), readProjects()]);
    if (o.ok) { offers = o.value; offersError = null; } else offersError = o.error;
    if (i.ok) { installations = i.value; installationsError = null; } else installationsError = i.error;
    if (p.ok) { projects = p.value; projectsError = null; } else projectsError = p.error;
    loading = false;
  }

  function choose(offer: Offer, project: ProjectEligibility) {
    installError = null;
    pending = { offer, project };
  }

  async function confirmInstall() {
    if (!pending || installing) return;
    installing = true;
    installError = null;
    const r = await installOffer(pending.offer, pending.project.projectId);
    if (!r.ok) installError = r.error;
    else pending = null;
    // Siempre se reconcilia con el estado local que reporta Nucleus.
    await refreshInstallations();
    installing = false;
  }

  async function choosePreparation(offer: Offer, project: ProjectEligibility, installation: InstalledInstance) {
    prepareError = null;
    const r = await readProjectFiles(project.projectId);
    if (!r.ok) { prepareError = r.error; return; }
    pendingPrepare = { offer, project, installation, files: r.value };
    selectedInputs = [];
  }

  async function confirmPrepare() {
    if (!pendingPrepare || preparing || selectedInputs.length === 0) return;
    preparing = true;
    prepareError = null;
    const r = await prepareOffer(pendingPrepare.offer, pendingPrepare.installation, selectedInputs);
    if (!r.ok) prepareError = r.error;
    else { pendingPrepare = null; selectedInputs = []; }
    await refreshInstallations();
    preparing = false;
  }

  onMount(load);
</script>

<div class="wisdom">
  <header>
    <span class="title">Wisdom</span>
    <span class="subtitle">Ofertas de Mandate para tus proyectos</span>
  </header>

  {#if loading}
    <p class="muted">Leyendo catálogo, instalaciones y proyectos…</p>
  {:else}
    <section>
      <h2>Oferta disponible</h2>
      {#if offersError}
        <p class="warn" data-testid="catalog-error">Catálogo no disponible: {offersError.code}</p>
      {:else if offers.length === 0}
        <p class="muted" data-testid="catalog-empty">No hay ofertas habilitadas para esta organización.</p>
      {:else}
        {#each offers as offer (offer.definition_id + offer.version)}
          <article class="offer" data-testid="offer">
            <div class="offer-head">
              <span class="label">{offer.label}</span>
              <span class="version">v{offer.version}</span>
            </div>
            <p class="purpose">{offer.purpose}</p>
            <dl>
              <dt>Publicador</dt><dd>{offer.publisher.publisher_id}</dd>
              <dt>Digest</dt><dd title={offer.digest} data-testid="offer-digest">{shortDigest(offer.digest)}</dd>
              <dt>Publicada</dt><dd>{offer.published_at}</dd>
            </dl>
            <p class="notice" data-testid="preparation">{preparationText(offer.preparation.status)}</p>

            <h3>Proyectos</h3>
            {#if projectsError}
              <p class="warn">Proyectos no disponibles: {projectsError.code}</p>
            {:else if projects.length === 0}
              <p class="muted">No hay proyectos en la organización activa.</p>
            {:else}
              <ul class="projects">
                {#each projects as project (project.projectId)}
                  {@const state = rowState(offer, project, installations)}
                  <li data-testid="project-row" data-project={project.projectId}>
                    <span class="project-name">{project.name}</span>
                    {#if state.kind === 'installed'}
                      {#if state.installation.instance.status === 'prepared'}
                        <span class="state installed" data-testid="prepared-state">Preparado · firmado · inactivo</span>
                      {:else}
                        <span class="state installed" data-testid="installed-state">Instalado · inactivo</span>
                        {#if offer.preparation.status === 'defined' && offer.version === '1.1.0' && state.installation.consistent}
                          <button data-testid="prepare" disabled={!project.eligible} on:click={() => choosePreparation(offer, project, state.installation)}>Preparar para {project.name}</button>
                          {#if !project.eligible}<span class="warn">{reasonText(project.reason || 'context_unavailable')}</span>{/if}
                        {:else}
                          <span class="state disabled">{preparationText(state.installation.instance.definition.preparation)}</span>
                        {/if}
                      {/if}
                    {:else if state.kind === 'not_eligible'}
                      <span class="state disabled" data-testid="not-eligible">{reasonText(state.reason)}</span>
                      <button disabled>Instalar para {project.name}</button>
                    {:else}
                      <button data-testid="install" on:click={() => choose(offer, project)}>Instalar para {project.name}</button>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </article>
        {/each}
      {/if}
    </section>

    {#if pending}
      <section class="confirm" data-testid="confirm">
        <p>
          Instalar <strong>{pending.offer.label} v{pending.offer.version}</strong>
          (digest <code title={pending.offer.digest}>{shortDigest(pending.offer.digest)}</code>)
          para <strong>{pending.project.name}</strong>.
        </p>
        <p class="muted">
          Nucleus descarga y verifica exactamente esta versión y la deja instalada e inactiva.
          No se preparan documentos, no se aprueba, no se activa y no se ejecuta nada.
        </p>
        {#if installError}<p class="warn" data-testid="install-error">No se instaló: {installError.code}</p>{/if}
        <div class="actions">
          <button data-testid="confirm-install" disabled={installing} on:click={confirmInstall}>{installing ? 'Instalando…' : 'Confirmar instalación'}</button>
          <button class="secondary" disabled={installing} on:click={() => (pending = null)}>Cancelar</button>
        </div>
      </section>
    {/if}

    {#if pendingPrepare}
      <section class="confirm" data-testid="prepare-confirm">
        <p>Preparar <strong>{pendingPrepare.offer.label} v{pendingPrepare.offer.version}</strong> para <strong>{pendingPrepare.project.name}</strong>, conservando la instalación {pendingPrepare.installation.instance.mandateId}.</p>
        <p class="muted">Elegí al menos un archivo del proyecto. Nucleus congelará sólo los seleccionados, firmará y verificará el contrato. El Mandate quedará inactivo; no se ejecutará ningún Intent.</p>
        {#if pendingPrepare.files.length === 0}<p class="warn">No hay archivos regulares elegibles en este proyecto.</p>{/if}
        <div class="installations">
          {#each pendingPrepare.files as file}
            <label><input type="checkbox" value={file} bind:group={selectedInputs} /> {file}</label>
          {/each}
        </div>
        {#if prepareError}<p class="warn" data-testid="prepare-error">No se preparó: {prepareError.code}</p>{/if}
        <div class="actions">
          <button data-testid="confirm-prepare" disabled={preparing || selectedInputs.length === 0} on:click={confirmPrepare}>{preparing ? 'Preparando…' : 'Confirmar preparación'}</button>
          <button class="secondary" disabled={preparing} on:click={() => (pendingPrepare = null)}>Cancelar</button>
        </div>
      </section>
    {/if}
    {#if prepareError && !pendingPrepare}<p class="warn" data-testid="prepare-error">No se pudieron leer los archivos del proyecto: {prepareError.code}</p>{/if}

    <section>
      <h2>Instaladas en esta máquina</h2>
      {#if installationsError}
        <p class="warn">Instalaciones no disponibles: {installationsError.code}</p>
      {:else if installations.length === 0}
        <p class="muted" data-testid="no-installations">Ninguna.</p>
      {:else}
        <ul class="installations">
          {#each installations as item (item.instance.mandateId)}
            <li data-testid="installation">
              <span>{item.instance.definition.label} · instalación v{item.instance.definition.version}{#if item.instance.preparation} · preparación v{item.instance.preparation.definition.version}{/if}</span>
              <span class="muted">proyecto {item.instance.projectId}</span>
              <span class="state installed">{item.instance.status === 'prepared' ? 'Preparado · inactivo' : 'Instalado · inactivo'}</span>
              {#if item.instance.preparation}<span class="muted" title={item.instance.preparation.contractDigest}>Contrato {shortDigest(item.instance.preparation.contractDigest)}</span>
              {:else if item.instance.status !== 'prepared'}<span class="state disabled">{preparationText(item.instance.definition.preparation)}</span>{/if}
              {#if !item.consistent}<span class="warn">Inconsistente: {item.problem}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<style>
  .wisdom { height: 100%; overflow: auto; padding: 24px 28px; color: #e8eaf0; background: #080a0e; box-sizing: border-box; }
  header { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }
  .title { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 600; }
  .subtitle, .muted { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(232, 234, 240, 0.5); }
  h2 { font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600; margin: 18px 0 10px; letter-spacing: 0.04em; }
  h3 { font-family: 'DM Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin: 16px 0 8px; color: rgba(232, 234, 240, 0.6); }
  .offer, .confirm { border: 1px solid rgba(232, 234, 240, 0.12); border-radius: 8px; padding: 16px; background: rgba(232, 234, 240, 0.03); }
  .confirm { margin-top: 16px; border-color: rgba(139, 92, 246, 0.5); }
  .offer-head { display: flex; align-items: baseline; gap: 10px; }
  .label { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 600; }
  .version, dd, code { font-family: 'DM Mono', monospace; font-size: 12px; }
  .purpose { margin: 6px 0 10px; font-size: 13px; color: rgba(232, 234, 240, 0.8); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; font-size: 12px; }
  dt { color: rgba(232, 234, 240, 0.5); }
  dd { margin: 0; }
  .notice { margin: 12px 0 0; font-family: 'DM Mono', monospace; font-size: 11px; color: #f5c46b; }
  .warn { font-family: 'DM Mono', monospace; font-size: 12px; color: #f08a8a; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  li { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 13px; }
  .project-name { min-width: 160px; }
  .state { font-family: 'DM Mono', monospace; font-size: 11px; padding: 2px 8px; border-radius: 10px; }
  .state.installed { background: rgba(110, 200, 150, 0.15); color: #8fdcb1; }
  .state.disabled { background: rgba(232, 234, 240, 0.08); color: rgba(232, 234, 240, 0.6); }
  .actions { display: flex; gap: 10px; margin-top: 12px; }
  button { font: inherit; font-size: 12px; padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(139, 92, 246, 0.6); background: rgba(139, 92, 246, 0.2); color: #e8eaf0; cursor: pointer; }
  button.secondary { border-color: rgba(232, 234, 240, 0.25); background: transparent; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
