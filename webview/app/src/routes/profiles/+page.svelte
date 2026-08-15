<script lang="ts">
  import { onMount } from 'svelte';
  import { listProfiles, type ChromeProfileSummary } from '$lib/api';

  let loading = true;
  let error = '';
  let profiles: ChromeProfileSummary[] = [];

  let launching = false;
  let launchError = '';
  let launchOk = false;

  $: masterProfile = profiles.find((p) => p.master_profile) ?? null;
  $: otherProfiles = profiles.filter((p) => !p.master_profile);

  async function load() {
    loading = true;
    error = '';
    try {
      const res = await listProfiles();
      profiles = res.profiles ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error al listar perfiles';
    } finally {
      loading = false;
    }
  }

  async function openLanding() {
    if (!masterProfile) return;
    const nucleusBridge = (window as any).nucleus;
    if (!nucleusBridge?.launchProfile) {
      launchError = 'window.nucleus no está disponible — esta vista requiere correr dentro de Conductor (Electron).';
      return;
    }
    launching = true;
    launchError = '';
    launchOk = false;
    try {
      const result = await nucleusBridge.launchProfile(masterProfile.id, 'landing');
      if (result?.success === false) {
        launchError = result.error || 'No se pudo abrir el perfil master';
      } else {
        launchOk = true;
      }
    } catch (e) {
      launchError = e instanceof Error ? e.message : 'Error al lanzar el perfil';
    } finally {
      launching = false;
    }
  }

  onMount(load);
</script>

<div class="profiles-page">
  <header>
    <span class="eyebrow">Profiles</span>
    <h1>Perfiles</h1>
  </header>

  {#if loading}
    <p class="hint">Cargando perfiles…</p>
  {:else if error}
    <div class="panel error-panel">
      <p class="hint error">{error}</p>
      <button class="btn-ghost" on:click={load}>Reintentar</button>
    </div>
  {:else if profiles.length === 0}
    <div class="panel">
      <p class="hint">No hay perfiles creados todavía.</p>
    </div>
  {:else}
    {#if masterProfile}
      <section class="panel master-panel">
        <div class="master-head">
          <span class="master-badge">MASTER</span>
          <h2>{masterProfile.name}</h2>
        </div>
        <p class="profile-id">{masterProfile.id}</p>
        <p class="profile-path">{masterProfile.path}</p>

        <div class="master-actions">
          <button class="btn-primary" on:click={openLanding} disabled={launching}>
            {launching ? 'Abriendo…' : 'Abrir landing'}
          </button>
          {#if launchOk}
            <span class="launch-status ok">Perfil lanzado</span>
          {/if}
          {#if launchError}
            <span class="launch-status error">{launchError}</span>
          {/if}
        </div>

        <div class="accounts-block">
          <h3>Accounts</h3>
          {#if masterProfile.accounts && masterProfile.accounts.length > 0}
            <ul class="accounts-list">
              {#each masterProfile.accounts as acc (acc.provider)}
                <li class="account-row">
                  <span class="account-provider">{acc.provider}</span>
                  <span class="account-identifier">{acc.identifier}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="hint">Sin cuentas vinculadas todavía.</p>
          {/if}
        </div>
      </section>
    {/if}

    {#if otherProfiles.length > 0}
      <section class="panel">
        <h2 class="section-title">Otros perfiles</h2>
        <ul class="profile-list">
          {#each otherProfiles as p (p.id)}
            <li class="profile-row">
              <span class="profile-name">{p.name}</span>
              <span class="profile-id-inline">{p.id}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</div>

<style>
  .profiles-page {
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

    max-width: 680px;
    margin: 0 auto;
    padding: var(--space-lg) var(--space-md);
    min-height: 100%;
    color: var(--color-text-primary);
    font-family: var(--font-mono);
    background: var(--color-bg);
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
    margin: var(--space-xs) 0 var(--space-md);
  }

  h2 {
    font-family: var(--font-display);
    font-size: 18px;
    margin: 0;
  }

  h3 {
    font-family: var(--font-display);
    font-size: 13px;
    margin: 0 0 var(--space-xs);
    color: var(--color-text-secondary);
  }

  .section-title {
    margin-bottom: var(--space-sm);
  }

  .hint {
    color: var(--color-text-secondary);
    font-size: 13px;
    line-height: 1.5;
  }

  .hint.error {
    color: var(--color-error);
  }

  .panel {
    margin-top: var(--space-md);
    padding: var(--space-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .error-panel {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-sm);
  }

  .master-panel {
    border-color: var(--color-accent-dim);
  }

  .master-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .master-badge {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--color-accent-dim);
    color: var(--color-accent);
  }

  .profile-id,
  .profile-path {
    font-size: 11px;
    color: var(--color-text-dim);
    margin: 2px 0;
    word-break: break-all;
  }

  .master-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-md);
  }

  .btn-primary {
    padding: 8px 18px;
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--color-bg);
    font-weight: 600;
    cursor: pointer;
    text-transform: uppercase;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-ghost {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .btn-ghost:hover {
    border-color: var(--color-border-active);
    color: var(--color-text-primary);
  }

  .launch-status {
    font-size: 11px;
  }

  .launch-status.ok {
    color: var(--color-accent);
  }

  .launch-status.error {
    color: var(--color-error);
  }

  .accounts-block {
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--color-border);
  }

  .accounts-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .account-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 6px 10px;
    background: var(--color-surface-hover);
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  .account-provider {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-accent);
    font-size: 10px;
  }

  .account-identifier {
    color: var(--color-text-secondary);
  }

  .profile-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .profile-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    padding: 6px 0;
    border-bottom: 1px solid var(--color-border);
    font-size: 13px;
  }

  .profile-row:last-child {
    border-bottom: none;
  }

  .profile-name {
    color: var(--color-text-primary);
  }

  .profile-id-inline {
    color: var(--color-text-dim);
    font-size: 11px;
  }
</style>
