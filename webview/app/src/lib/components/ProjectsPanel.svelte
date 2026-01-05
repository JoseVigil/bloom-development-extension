<script lang="ts">
  import { onMount } from 'svelte';
  import { listNuclei, listNucleusProjects, addProject } from '$lib/api';
  import { onboardingStore } from '$lib/stores/onboarding';
  import { createEventDispatcher } from 'svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  
  const dispatch = createEventDispatcher();
  
  interface Nucleus {
    id: string;
    org: string;
    path: string;
  }
  
  interface Project {
    id: string;
    name: string;
    path: string;
    strategy?: string;
    description?: string;
  }
  
  let nuclei: Nucleus[] = [];
  let selectedNucleusPath = '';
  let projects: Project[] = [];
  let loading = false;
  let loadingProjects = false;
  let initialLoad = true;
  let newProjectPath = '';
  let newProjectName = '';
  let newProjectStrategy = 'auto';
  let creating = false;
  let error = '';
  let showAdvanced = false;
  let searchQuery = '';
  
  // Filtered projects based on search
  $: filteredProjects = searchQuery
    ? projects.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.path.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;
  
  async function loadNuclei() {
    loading = true;
    error = '';
    
    try {
      const result = await listNuclei();
      nuclei = result.nuclei || [];
      
      if (nuclei.length > 0 && !selectedNucleusPath) {
        selectedNucleusPath = nuclei[0].path || nuclei[0].id;
        await loadProjects();
      }
      
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error al cargar Nuclei';
      console.error('Error loading nuclei:', e);
    } finally {
      loading = false;
      initialLoad = false;
    }
  }
  
  async function loadProjects() {
    if (!selectedNucleusPath) return;
    
    loadingProjects = true;
    error = '';
    
    try {
      const result = await listNucleusProjects(selectedNucleusPath);
      projects = result.projects || [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error al cargar proyectos';
      console.error('Error loading projects:', e);
    } finally {
      loadingProjects = false;
    }
  }
  
  async function handleCreate() {
    if (!newProjectPath.trim() || !selectedNucleusPath) return;
    
    creating = true;
    error = '';
    
    try {
      const params: any = {
        project_path: newProjectPath.trim(),
        nucleus_path: selectedNucleusPath
      };
      
      if (newProjectName.trim()) {
        params.name = newProjectName.trim();
      }
      
      if (newProjectStrategy !== 'auto') {
        params.strategy = newProjectStrategy;
      }
      
      await addProject(params);
      
      // Clear form
      newProjectPath = '';
      newProjectName = '';
      newProjectStrategy = 'auto';
      showAdvanced = false;
      
      // Reload projects
      await loadProjects();
      
      // Refresh onboarding status
      await onboardingStore.refresh();
      
      // Dispatch success event
      dispatch('added');
      
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error al agregar proyecto';
      console.error('Error adding project:', e);
    } finally {
      creating = false;
    }
  }
  
  function handleBrowse() {
    // In Electron environment, trigger file dialog
    if (typeof window !== 'undefined' && (window as any).api?.selectDirectory) {
      (window as any).api.selectDirectory().then((path: string) => {
        if (path) {
          newProjectPath = path;
        }
      });
    } else {
      // Fallback for web: show instruction
      alert('En la versión de escritorio, esto abriría un selector de archivos. Por ahora, ingresa la ruta manualmente.');
    }
  }
  
  onMount(loadNuclei);
</script>

<div class="projects-panel">
  {#if nuclei.length === 0}
    <div class="empty-state" transition:fade>
      <svg width="64" height="64" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
        <path d="M1 2.5A1.5 1.5 0 012.5 1h1.586a1.5 1.5 0 011.06.44l.415.414A.5.5 0 006.207 2H12.5A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 010 12.5v-10z"/>
      </svg>
      <h3>Primero crea un Nucleus</h3>
      <p>Necesitas al menos un Nucleus antes de poder agregar proyectos</p>
      <button 
        class="secondary-button"
        on:click={() => dispatch('needsNucleus')}
      >
        Volver al paso anterior
      </button>
    </div>
  {:else}
    <!-- Nucleus Selector -->
    <div class="section">
      <label for="nucleus-select" class="section-label">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1.5 0A1.5 1.5 0 000 1.5v13A1.5 1.5 0 001.5 16h13a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0014.5 0h-13zM8 3.5c1.381 0 2.5 1.119 2.5 2.5S9.381 8.5 8 8.5 5.5 7.381 5.5 6 6.619 3.5 8 3.5zM12 13H4v-1c0-1.657 1.343-3 3-3h2c1.657 0 3 1.343 3 3v1z"/>
        </svg>
        Selecciona Nucleus
      </label>
      
      <div class="select-wrapper">
        <select 
          id="nucleus-select"
          bind:value={selectedNucleusPath} 
          on:change={loadProjects}
          disabled={loading}
        >
          {#each nuclei as nucleus}
            <option value={nucleus.path || nucleus.id}>
              {nucleus.org} ({nucleus.path})
            </option>
          {/each}
        </select>
        
        <button
          class="refresh-button"
          on:click={loadProjects}
          disabled={loadingProjects}
          title="Actualizar proyectos"
          type="button"
        >
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 16 16" 
            fill="currentColor"
            class:spinning={loadingProjects}
          >
            <path d="M8 3a5 5 0 104.546 2.914.5.5 0 00-.908-.417A4 4 0 118 4v1z"/>
            <path d="M8 0a.5.5 0 01.5.5v4a.5.5 0 01-1 0v-4A.5.5 0 018 0z"/>
          </svg>
        </button>
      </div>
    </div>
    
    <!-- Projects List -->
    <div class="section">
      <div class="section-header">
        <h3>Proyectos ({projects.length})</h3>
        
        {#if projects.length > 0}
          <div class="search-box">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.1zM12 6.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z"/>
            </svg>
            <input
              type="search"
              bind:value={searchQuery}
              placeholder="Buscar proyectos..."
              class="search-input"
            />
          </div>
        {/if}
      </div>
      
      {#if initialLoad || loadingProjects}
        <!-- Skeleton loader -->
        <div class="skeleton-list">
          {#each [1, 2, 3] as i}
            <div class="skeleton-item" in:fade={{ duration: 200, delay: i * 100 }}>
              <div class="skeleton-line wide"></div>
              <div class="skeleton-line narrow"></div>
            </div>
          {/each}
        </div>
      {:else if filteredProjects.length === 0}
        <div class="empty-projects" transition:fade>
          <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
            <path d="M1 2.5A1.5 1.5 0 012.5 1h1.586a1.5 1.5 0 011.06.44l.415.414A.5.5 0 006.207 2H12.5A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 010 12.5v-10z"/>
            <path d="M4 8h8v1H4V8z"/>
          </svg>
          <p>{searchQuery ? 'No se encontraron proyectos' : 'No hay proyectos vinculados'}</p>
          <span>Agrega tu primer proyecto para comenzar</span>
        </div>
      {:else}
        <div class="projects-list">
          {#each filteredProjects as project, i (project.id)}
            <div 
              class="project-card"
              in:fly={{ y: 20, duration: 300, delay: i * 50, easing: cubicOut }}
            >
              <div class="project-icon">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 2.5A1.5 1.5 0 012.5 1h1.586a1.5 1.5 0 011.06.44l.415.414A.5.5 0 006.207 2H12.5A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 010 12.5v-10z"/>
                </svg>
              </div>
              
              <div class="project-info">
                <div class="project-name">{project.name}</div>
                
                <div class="project-meta">
                  <span class="meta-item">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M1 2.5A1.5 1.5 0 012.5 1h11A1.5 1.5 0 0115 2.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 13.5v-11z"/>
                    </svg>
                    {project.strategy || 'auto'}
                  </span>
                  
                  <code class="project-path">{project.path}</code>
                </div>
                
                {#if project.description}
                  <div class="project-description">{project.description}</div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    
    <!-- Add Project Form -->
    <div class="section">
      <h3>Agregar proyecto</h3>
      
      <div class="add-form">
        <div class="input-group">
          <label for="project-path">
            Ruta del proyecto *
          </label>
          
          <div class="path-input-group">
            <input
              id="project-path"
              type="text"
              bind:value={newProjectPath}
              placeholder="/ruta/a/mi-proyecto"
              disabled={creating}
            />
            
            <button
              type="button"
              class="browse-button"
              on:click={handleBrowse}
              disabled={creating}
              title="Examinar..."
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 2.5A1.5 1.5 0 012.5 1h1.586a1.5 1.5 0 011.06.44l.415.414A.5.5 0 006.207 2H12.5A1.5 1.5 0 0114 3.5v9a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 010 12.5v-10z"/>
              </svg>
              Examinar
            </button>
          </div>
          
          <p class="hint">
            Ruta absoluta al directorio del proyecto local
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
              <label for="project-name">
                Nombre personalizado
                <span class="optional">(opcional)</span>
              </label>
              <input
                id="project-name"
                type="text"
                bind:value={newProjectName}
                placeholder="Mi Proyecto"
                disabled={creating}
              />
              <p class="hint">
                Si no se especifica, se usará el nombre del directorio
              </p>
            </div>
            
            <div class="input-group">
              <label for="project-strategy">
                Estrategia de detección
              </label>
              <select
                id="project-strategy"
                bind:value={newProjectStrategy}
                disabled={creating}
              >
                <option value="auto">Automática</option>
                <option value="package.json">Node.js (package.json)</option>
                <option value="pyproject.toml">Python (pyproject.toml)</option>
                <option value="Cargo.toml">Rust (Cargo.toml)</option>
                <option value="pom.xml">Java (pom.xml)</option>
                <option value="go.mod">Go (go.mod)</option>
              </select>
              <p class="hint">
                Método para detectar el tipo de proyecto
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
        
        <button
          class="add-button"
          on:click={handleCreate}
          disabled={creating || !newProjectPath.trim() || !selectedNucleusPath}
          type="button"
        >
          {#if creating}
            <span class="spinner"></span>
            Agregando proyecto...
          {:else}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 110 16A8 8 0 018 0zM7 4v3H4v2h3v3h2V9h3V7H9V4H7z"/>
            </svg>
            Agregar proyecto
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .projects-panel {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  
  .section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .section-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    font-size: 0.9375rem;
    color: #374151;
    margin-bottom: 0.5rem;
  }
  
  .select-wrapper {
    display: flex;
    gap: 0.75rem;
  }
  
  select {
    flex: 1;
    padding: 0.75rem;
    border: 2px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.9375rem;
    background: white;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  select:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }
  
  select:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }
  
  .refresh-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    background: white;
    border: 2px solid #d1d5db;
    border-radius: 8px;
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
  
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }
  
  h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
  }
  
  .search-box {
    position: relative;
    display: flex;
    align-items: center;
  }
  
  .search-box svg {
    position: absolute;
    left: 0.75rem;
    color: #9ca3af;
    pointer-events: none;
  }
  
  .search-input {
    padding: 0.5rem 0.75rem 0.5rem 2.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    width: 200px;
    transition: all 0.2s ease;
  }
  
  .search-input:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
    width: 250px;
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
  
  /* Empty States */
  .empty-state,
  .empty-projects {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 3rem 1.5rem;
    text-align: center;
    color: #9ca3af;
  }
  
  .empty-state h3 {
    color: #6b7280;
    margin-top: 1rem;
  }
  
  .empty-state p,
  .empty-projects p {
    margin: 0;
    font-weight: 500;
    color: #6b7280;
  }
  
  .empty-state span,
  .empty-projects span {
    font-size: 0.875rem;
  }
  
  .secondary-button {
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background: white;
    color: #374151;
    border: 2px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .secondary-button:hover {
    background: #f9fafb;
    border-color: #9ca3af;
  }
  
  /* Projects List */
  .projects-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .project-card {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    transition: all 0.2s ease;
  }
  
  .project-card:hover {
    border-color: #cbd5e1;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }
  
  .project-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    background: #f3f4f6;
    border-radius: 8px;
    color: #6b7280;
    flex-shrink: 0;
  }
  
  .project-info {
    flex: 1;
    min-width: 0;
  }
  
  .project-name {
    font-weight: 600;
    font-size: 0.9375rem;
    color: #111827;
    margin-bottom: 0.375rem;
  }
  
  .project-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  
  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    background: #f3f4f6;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    color: #6b7280;
  }
  
  .project-path {
    font-size: 0.75rem;
    color: #9ca3af;
    font-family: 'Courier New', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .project-description {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #6b7280;
    line-height: 1.5;
  }
  
  /* Add Form */
  .add-form {
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
  
  .optional {
    font-size: 0.75rem;
    font-weight: 400;
    color: #9ca3af;
  }
  
  .path-input-group {
    display: flex;
    gap: 0.75rem;
  }
  
  input[type="text"],
  input[type="search"] {
    flex: 1;
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
  
  input:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }
  
  .browse-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: white;
    color: #374151;
    border: 2px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }
  
  .browse-button:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #9ca3af;
  }
  
  .browse-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .hint {
    margin: 0;
    font-size: 0.8125rem;
    color: #6b7280;
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
  
  .error-message svg {
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
  
  .add-button {
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
  
  .add-button:hover:not(:disabled) {
    background: #4338ca;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }
  
  .add-button:disabled {
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