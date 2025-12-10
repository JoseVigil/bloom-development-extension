<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { intentsStore } from '$lib/stores/intents';
  import { websocketStore } from '$lib/stores/websocket';
  import { Plus, Filter, ChevronRight, Loader } from 'lucide-svelte';
  
  let loading = true;
  let filters = { type: 'all', status: 'all', profile: 'all', project: 'all' };
  let showCreateModal = false;
  let showImportModal = false;
  
  $: filtered = $intentsStore.list.filter(i => {
    if (filters.type !== 'all' && i.type !== filters.type) return false;
    if (filters.status !== 'all' && i.status !== filters.status) return false;
    if (filters.profile !== 'all' && i.profile !== filters.profile) return false;
    if (filters.project !== 'all' && i.project !== filters.project) return false;
    return true;
  });
  
  onMount(async () => {
    await intentsStore.load();
    loading = false;
    
    websocketStore.onUpdate(() => {
      intentsStore.load();
    });
  });
  
  function openIntent(id: string) {
    goto(`/intents/${id}`);
  }
  
  function createIntent() {
    showCreateModal = true;
  }
  
  function importIntent() {
    showImportModal = true;
  }
</script>

<div class="intents-page">
  <header class="page-header">
    <div class="header-top">
      <h2>Intents</h2>
      <div class="actions">
        <button on:click={importIntent} class="btn-secondary" aria-label="Import Intent from DEV">
          Import from DEV
        </button>
        <button on:click={createIntent} class="btn-primary" aria-label="Create Intent DOC">
          <Plus size={18} />
          Create Intent DOC
        </button>
      </div>
    </div>
    
    <div class="filters">
      <select bind:value={filters.type} class="filter-select" aria-label="Filter by type">
        <option value="all">All Types</option>
        <option value="DEV">DEV</option>
        <option value="DOC">DOC</option>
      </select>
      <select bind:value={filters.status} class="filter-select" aria-label="Filter by status">
        <option value="all">All Status</option>
        <option value="draft">Draft</option>
        <option value="completed">Completed</option>
        <option value="in-progress">In Progress</option>
      </select>
      <select bind:value={filters.profile} class="filter-select" aria-label="Filter by profile">
        <option value="all">All Profiles</option>
        <option value="main">Main</option>
      </select>
      <select bind:value={filters.project} class="filter-select" aria-label="Filter by project">
        <option value="all">All Projects</option>
      </select>
    </div>
  </header>

  <div class="intents-list">
    {#if loading}
      <div class="loading">
        <Loader class="spin" size={32} />
        <p>Loading intents...</p>
      </div>
    {:else if filtered.length === 0}
      <div class="empty">
        <p>No intents found</p>
        <button on:click={createIntent} class="btn-primary">Create your first Intent</button>
      </div>
    {:else}
      {#each filtered as intent (intent.id)}
        <div class="intent-card" on:click={() => openIntent(intent.id)} on:keydown={(e) => e.key === 'Enter' && openIntent(intent.id)} role="button" tabindex="0">
          <div class="card-content">
            <div class="card-header">
              <div class="badges">
                <span class="badge badge-{intent.type.toLowerCase()}">{intent.type}</span>
                <span class="badge badge-{intent.status}">{intent.status}</span>
                {#if intent.derivedFrom}
                  <span class="derived">← {intent.derivedFrom}</span>
                {/if}
              </div>
            </div>
            <h3 class="intent-title">{intent.title}</h3>
            <div class="intent-meta">
              <span>{intent.project || 'No project'}</span>
              <span>•</span>
              <span>{intent.profile}</span>
            </div>
            {#if intent.briefingSummary}
              <p class="intent-summary">{intent.briefingSummary}</p>
            {/if}
          </div>
          <ChevronRight class="chevron" size={20} />
        </div>
      {/each}
    {/if}
  </div>
</div>

{#if showCreateModal}
  <div class="modal-overlay" on:click={() => showCreateModal = false}>
    <div class="modal" on:click|stopPropagation>
      <h3>Create Intent DOC</h3>
      <p>Creating new intent...</p>
      <button on:click={() => { showCreateModal = false; goto('/intents/new'); }} class="btn-primary">Continue</button>
    </div>
  </div>
{/if}

{#if showImportModal}
  <div class="modal-overlay" on:click={() => showImportModal = false}>
    <div class="modal" on:click|stopPropagation>
      <h3>Import Intent from DEV</h3>
      <p>Select a DEV intent to derive documentation...</p>
      <button on:click={() => showImportModal = false} class="btn-secondary">Cancel</button>
    </div>
  </div>
{/if}

<style>
  .intents-page {
    padding: 1.5rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1.875rem;
    font-weight: 700;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
  }

  .btn-primary, .btn-secondary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover {
    background: var(--accent-hover);
  }

  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-secondary:hover {
    background: var(--bg-secondary);
  }

  .filters {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .filter-select {
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .intents-list {
    display: grid;
    gap: 1rem;
  }

  .loading, .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
    gap: 1rem;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .intent-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .intent-card:hover {
    border-color: var(--accent);
    box-shadow: 0 4px 12px rgba(0, 122, 204, 0.15);
  }

  .intent-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .card-content {
    flex: 1;
  }

  .card-header {
    margin-bottom: 0.5rem;
  }

  .badges {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .badge-dev {
    background: #8b5cf6;
    color: white;
  }

  .badge-doc {
    background: var(--accent);
    color: white;
  }

  .badge-draft {
    background: #f59e0b;
    color: white;
  }

  .badge-completed {
    background: #10b981;
    color: white;
  }

  .badge-in-progress {
    background: #3b82f6;
    color: white;
  }

  .derived {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .intent-title {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .intent-meta {
    display: flex;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }

  .intent-summary {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .chevron {
    color: var(--text-secondary);
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-secondary);
    padding: 2rem;
    border-radius: 12px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .modal h3 {
    margin: 0 0 1rem;
    font-size: 1.5rem;
  }

  .modal p {
    margin: 0 0 1.5rem;
    color: var(--text-secondary);
  }
</style>