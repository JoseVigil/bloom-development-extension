<script lang="ts">
  import { onMount } from 'svelte';
  import { listNuclei, createNucleus } from '$lib/api';
  import { onboardingStore } from '$lib/stores/onboarding';
  import { createEventDispatcher } from 'svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  
  const dispatch = createEventDispatcher();
  
  interface Nucleus {
    id: string;
    org: string;
    path: string;
    projects_count?: number;
    created_at?: string;
  }
  
  let nuclei: Nucleus[] = [];
  let loading = false;
  let initialLoad = true;
  let newOrgName = '';
  let newPath = '';
  let newUrl = '';
  let creating = false;
  let error = '';
  let createProgress: string[] = [];
  let showAdvanced = false;
  let selectedNucleus: string | null = null;
  
  // Real-time validation
  $: orgNameValid = newOrgName.length === 0 || /^[a-zA-Z0-9_-]+$/.test(newOrgName);
  $: showOrgError = newOrgName.length > 0 && !orgNameValid;
  
  async function loadNuclei() {
    loading = true;
    error = '';
    
    try {
      const result = await listNuclei();
      nuclei = result.nuclei || [];
      
      // Auto-select first nucleus if available
      if (nuclei.length > 0 && !selectedNucleus) {
        selectedNucleus = nuclei[0].id;
      }
      
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error al cargar Nuclei';
      console.error('Error loading nuclei:', e);
    } finally {
      loading = false;
      initialLoad = false;
    }
  }
  
  async function handleCreate() {
    if (!newOrgName.trim() || !orgNameValid) return;
    
    creating = true;
    error = '';
    createProgress = [];
    
    try {
      // Simulate progress updates (in real implementation, you'd stream these from WebSocket)
      createProgress = ['Inicializando Nucleus...'];
      
      const params: any = { org: newOrgName.trim() };
      if (newPath.trim()) params.path = newPath.trim();
      if (newUrl.trim()) params.url = newUrl.trim();
      
      // Update progress
      setTimeout(() => {
        createProgress = [...createProgress, 'Creando estructura de directorios...'];
      }, 500);
      
      setTimeout(() => {
        createProgress = [...createProgress, 'Inicializando configuración...'];
      }, 1000);
      
      const result = await createNucleus(params);
      
      createProgress = [...createProgress, '✓ Nucleus creado exitosamente'];
      
      // Clear form
      newOrgName = '';
      newPath = '';
      newUrl = '';
      showAdvanced = false;
      
      // Reload list
      await loadNuclei();
      
      // Refresh onboarding status
      await onboardingStore.refresh();
      
      // Dispatch success event
      dispatch('created', result);
      
      // Clear progress after delay
      setTimeout(() => {
        createProgress = [];
      }, 3000);
      
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error al crear Nucleus';
      createProgress = [...createProgress, `❌ Error: ${error}`];
      console.error('Error creating nucleus:', e);
    } finally {
      creating = false;
    }
  }
  
  function formatDate(dateStr?: string): string {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }
  
  onMount(loadNuclei);
</script>

<div class="nucleus-panel">
  <!-- Existing Nuclei List -->
  <div class="section">
    <div class="section-header">
      <h3>Nuclei existentes</h3>
      <button
        class="refresh-button"
        on:click={loadNuclei}
        disabled={loading}
        title="Actualizar lista"
        type="button"
      >
        <svg 
          width="16" 
          height="16" 
          viewBox="0 0 16 16" 
          fill="currentColor"
          class:spinning={loading}
        >
          <path d="M8 3a5 5 0 104.546 2.914.5.5 0 00-.908-.417A4 4 0 118 4v1z"/>
          <path d="M8 0a.5.5 0 01.5.5v4a.5.5 0 01-1 0v-4A.5.5 0 018 0z"/>
        </svg>
      </button>
    </div>
    
    {#if initialLoad}
      <!-- Skeleton loader -->
      <div class="skeleton-list">
        {#each [1, 2] as i}
          <div class="skeleton-item" in:fade={{ duration: 200, delay: i * 100 }}>
            <div class="skeleton-line wide"></div>
            <div class="skeleton-line narrow"></div>
          </div>
        {/each}
      </div>
    {:else if nuclei.length === 0}
      <div class="empty-state" transition:fade>
        <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
          <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 13H7v-2h2v2zm0-3H7V4h2v6z"/>
        </svg>
        <p>No hay Nuclei configurados</p>
        <span>Crea tu primer Nucleus para comenzar</span>
      </div>
    {:else}
      <div class="nuclei-grid">
        {#each nuclei as nucleus, i (nucleus.id)}
          <div 
            class="nucleus-card"
            class:selected={selectedNucleus === nucleus.id}
            on:click={() => selectedNucleus = nucleus.id}
            in:fly={{ y: 20, duration: 300, delay: i * 50, easing: cubicOut }}
          >
            <div class="card-header">
              <div class="org-badge">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1.5 0A1.5 1.5 0 000 1.5v13A1.5 1.5 0 001.5 16h13a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0014.5 0h-13zM8 3.5c1.381 0 2.5 1.119 2.5 2.5S9.381 8.5 8 8.5 5.5 7.381 5.5 6 6.619 3.5 8 3.5zM12 13H4v-1c0-1.657 1.343-3 3-3h2c1.657 0 3 1.343 3 3v1z"/>
                </svg>
                {nucleus.org}
              </div>
              
              {#if selectedNucleus === nucleus.id}
                <span class="selected-badge" transition:fade>✓</span>
              {/if}
            </div>
            
            <div class="card-details">
              <div class="detail-row">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 2.5A1.5 1.5 0 012.5 1h11A1.5 1.5 0 0115 2.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 13.5v-11zM2.5 2a.5.5 0 00-.5.5v11a.5.5 0 00.5.5h11a.5.5 0 00.5-.5v-11a.5.5 0 00-.5-.5h-11z"/>
                  <path d="M4 6h8v1H4V6zm0 3h8v1H4V9z"/>
                </svg>
                <span class="detail-label">Proyectos:</span>
                <span class="detail-value">{nucleus.projects_count || 0}</span>
              </div>
              
              <div class="detail-row">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.5 0a.5.5 0 01.5.5V1h8V.5a.5.5 0 011 0V1h1a2 2 0 012 2v11a2 2 0 01-2 2H2a2 2 0 01-2-2V3a2 2 0 012-2h1V.5a.5.5 0 01.5-.5z"/>
                </svg>
                <span class="detail-label">Creado:</span>
                <span class="detail-value">{formatDate(nucleus.created_at)}</span>
              </div>
              
              <div class="detail-row path">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 2.5A1.5 1.5 0 012.5 1h1.586a1.5 1.5 0 011.06.44l.415.414A.5.5 0 006.207 2H12.5A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 010 12.5v-10z"/>
                </svg>
                <code>{nucleus.path}</code>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  
  <!-- Create New Nucleus -->
  <div class="section">
    <h3>Crear nuevo Nucleus</h3>
    
    <div class="create-form">
      <div class="input-group">
        <label for="org-name">
          Nombre de la organización *
          {#if orgNameValid && newOrgName.length > 0}
            <span class="valid-badge" transition:fade>✓ Válido</span>
          {/if}
        </label>
        
        <input
          id="org-name"
          type="text"
          bind:value={newOrgName}
          placeholder="mi-organizacion"
          disabled={creating}
          class:valid={orgNameValid && newOrgName.length > 0}
          class:invalid={showOrgError}
        />
        
        {#if showOrgError}
          <div class="validation-error" transition:slide={{ duration: 200 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm4.93 11.07L11.07 12.93 8 9.86l-3.07 3.07-1.86-1.86L6.14 8 3.07 4.93l1.86-1.86L8 6.14l3.07-3.07 1.86 1.86L9.86 8l3.07 3.07z"/>
            </svg>
            Solo letras, números, guiones y guiones bajos
          </div>
        {/if}
        
        <p class="hint">
          Este será el nombre de tu organización en Bloom
        </p>
      </div>
      
      <div class="advanced-toggle">
        <button
          type="button"
          class="toggle-button"
          on:click={() => showAdvanced = !showAdvanced}
        >
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 16 16" 
            fill="currentColor"
            style="transform: rotate({showAdvanced ? 90 : 0}deg); transition: transform 0.2s;"
          >
            <path d="M6 4l4 4-4 4z"/>
          </svg>
          Opciones avanzadas
        </button>
      </div>
      
      {#if showAdvanced}
        <div class="advanced-fields" transition:slide={{ duration: 300 }}>
          <div class="input-group">
            <label for="nucleus-path">
              Ruta personalizada
              <span class="optional">(opcional)</span>
            </label>
            <input
              id="nucleus-path"
              type="text"
              bind:value={newPath}
              placeholder="/ruta/a/mi-nucleus"
              disabled={creating}
            />
            <p class="hint">
              Deja vacío para usar la ruta por defecto
            </p>
          </div>
          
          <div class="input-group">
            <label for="org-url">
              URL de la organización
              <span class="optional">(opcional)</span>
            </label>
            <input
              id="org-url"
              type="url"
              bind:value={newUrl}
              placeholder="https://github.com/mi-organizacion"
              disabled={creating}
            />
            <p class="hint">
              URL del perfil de GitHub o sitio web
            </p>
          </div>
        </div>
      {/if}
      
      {#if error}
        <div class="error-message" transition:slide={{ duration: 200 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zM7 3h2v6H7V3zm0 8h2v2H7v-2z"/>
          </svg>
          {error}
        </div>
      {/if}
      
      {#if createProgress.length > 0}
        <div class="progress-log" transition:slide={{ duration: 300 }}>
          <div class="progress-header">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class:spinning={creating}>
              <path d="M8 3a5 5 0 104.546 2.914.5.5 0 00-.908-.417A4 4 0 118 4v1z"/>
              <path d="M8 0a.5.5 0 01.5.5v4a.5.5 0 01-1 0v-4A.5.5 0 018 0z"/>
            </svg>
            Progreso de creación
          </div>
          <div class="progress-lines">
            {#each createProgress as line, i (i)}
              <div 
                class="progress-line"
                class:success={line.includes('✓')}
                class:error={line.includes('❌')}
                in:slide={{ duration: 200, delay: i * 100 }}
              >
                {line}
              </div>
            {/each}
          </div>
        </div>
      {/if}
      
      <button
        class="create-button"
        on:click={handleCreate}
        disabled={creating || !newOrgName.trim() || !orgNameValid}
        type="button"
      >
        {#if creating}
          <span class="spinner"></span>
          Creando Nucleus...
        {:else}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 110 16A8 8 0 018 0zM7 4v3H4v2h3v3h2V9h3V7H9V4H7z"/>
          </svg>
          Crear Nucleus
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .nucleus-panel {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  
  .section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
  }
  
  .refresh-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    cursor: pointer;
    color: #6b7280;
    transition: all 0.15s ease;
  }
  
  .refresh-button:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #9ca3af;
    color: #374151;
  }
  
  .refresh-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  
  .refresh-button svg.spinning {
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  /* Skeleton Loader */
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .skeleton-item {
    padding: 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
  
  .skeleton-line {
    height: 1rem;
    background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
    background-size: 200% 100%;
    border-radius: 4px;
    animation: shimmer 1.5s infinite;
  }
  
  .skeleton-line.wide {
    width: 60%;
    margin-bottom: 0.5rem;
  }
  
  .skeleton-line.narrow {
    width: 40%;
  }
  
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  
  /* Empty State */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 3rem 1.5rem;
    text-align: center;
    color: #9ca3af;
  }
  
  .empty-state p {
    margin: 0;
    font-weight: 500;
    color: #6b7280;
  }
  
  .empty-state span {
    font-size: 0.875rem;
  }
  
  /* Nuclei Grid */
  .nuclei-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
  }
  
  .nucleus-card {
    padding: 1.25rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .nucleus-card:hover {
    border-color: #cbd5e1;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    transform: translateY(-2px);
  }
  
  .nucleus-card.selected {
    border-color: #4f46e5;
    background: #f5f3ff;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }
  
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  
  .org-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: #f3f4f6;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.9375rem;
    color: #374151;
  }
  
  .selected-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    background: #10b981;
    color: white;
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: 700;
  }
  
  .card-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .detail-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #6b7280;
  }
  
  .detail-row svg {
    flex-shrink: 0;
  }
  
  .detail-label {
    font-weight: 500;
  }
  
  .detail-value {
    margin-left: auto;
    color: #374151;
    font-weight: 600;
  }
  
  .detail-row.path {
    flex-wrap: wrap;
  }
  
  .detail-row.path code {
    flex: 1 1 100%;
    margin-top: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    font-size: 0.75rem;
    word-break: break-all;
  }
  
  /* Create Form */
  .create-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: #f9fafb;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
  }
  
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    font-size: 0.9375rem;
    color: #374151;
  }
  
  .valid-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    background: #d1fae5;
    color: #065f46;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .optional {
    font-size: 0.75rem;
    font-weight: 400;
    color: #9ca3af;
  }
  
  input {
    padding: 0.75rem;
    border: 2px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.9375rem;
    transition: all 0.2s ease;
    background: white;
  }
  
  input:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }
  
  input.valid {
    border-color: #10b981;
  }
  
  input.invalid {
    border-color: #ef4444;
  }
  
  input:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }
  
  .hint {
    margin: 0;
    font-size: 0.8125rem;
    color: #6b7280;
  }
  
  .validation-error,
  .error-message {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #fee2e2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #991b1b;
    font-size: 0.875rem;
    line-height: 1.5;
  }
  
  .validation-error svg,
  .error-message svg {
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
  
  .advanced-toggle {
    padding-top: 0.5rem;
  }
  
  .toggle-button {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    background: none;
    border: none;
    color: #6b7280;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
    transition: color 0.15s ease;
  }
  
  .toggle-button:hover {
    color: #374151;
  }
  
  .advanced-fields {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-top: 0.5rem;
  }
  
  .progress-log {
    padding: 1rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
  
  .progress-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    font-weight: 600;
    font-size: 0.875rem;
    color: #374151;
  }
  
  .progress-lines {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  
  .progress-line {
    padding: 0.5rem 0.75rem;
    background: #f9fafb;
    border-left: 3px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: 'Courier New', monospace;
    color: #6b7280;
  }
  
  .progress-line.success {
    border-left-color: #10b981;
    color: #065f46;
    background: #d1fae5;
  }
  
  .progress-line.error {
    border-left-color: #ef4444;
    color: #991b1b;
    background: #fee2e2;
  }
  
  .create-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    background: #4f46e5;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .create-button:hover:not(:disabled) {
    background: #4338ca;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }
  
  .create-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
</style>