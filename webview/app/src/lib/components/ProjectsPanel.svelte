<script lang="ts">
  import { onMount } from 'svelte';
  import { listNuclei, listNucleusProjects, addProject } from '../api'; // ← CAMBIOS AQUÍ
  import type { Project, Nucleus } from '../types';
  
  let nuclei: Nucleus[] = [];
  let selectedNucleusPath = '';
  let projects: Project[] = [];
  let loading = false;
  let newProjectPath = '';
  let creating = false;
  
  async function loadNuclei() {
    try {
      const result = await listNuclei();
      nuclei = result.nuclei || [];
      if (nuclei.length > 0) {
        selectedNucleusPath = nuclei[0].path || nuclei[0].id;
        await loadProjects();
      }
    } catch (error) {
      console.error('Error loading nuclei:', error);
    }
  }
  
  async function loadProjects() {
    if (!selectedNucleusPath) return;
    
    loading = true;
    try {
      const result = await listNucleusProjects(selectedNucleusPath);
      projects = result.projects || [];
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      loading = false;
    }
  }
  
  async function handleCreate() {
    if (!newProjectPath.trim() || !selectedNucleusPath) return;
    
    creating = true;
    try {
      await addProject({
        project_path: newProjectPath,
        nucleus_path: selectedNucleusPath
      });
      newProjectPath = '';
      await loadProjects();
    } catch (error) {
      console.error('Error creating project:', error);
    } finally {
      creating = false;
    }
  }
  
  onMount(loadNuclei);
</script>

<div class="panel">
  <h3>Projects</h3>
  
  {#if nuclei.length === 0}
    <p>Primero crea un Nucleus</p>
  {:else}
    <select bind:value={selectedNucleusPath} on:change={loadProjects}>
      {#each nuclei as nucleus}
        <option value={nucleus.path || nucleus.id}>{nucleus.name}</option>
      {/each}
    </select>
    
    {#if loading}
      <p>Cargando...</p>
    {:else}
      <ul>
        {#each projects as project}
          <li>{project.name}</li>
        {/each}
      </ul>
    {/if}
    
    <div class="create">
      <input 
        type="text" 
        bind:value={newProjectPath} 
        placeholder="Path del proyecto"
        disabled={creating}
      />
      <button on:click={handleCreate} disabled={creating || !newProjectPath.trim()}>
        {creating ? 'Agregando...' : 'Agregar'}
      </button>
    </div>
  {/if}
</div>

<style>
  .panel {
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
  }
  
  h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
  }
  
  select {
    width: 100%;
    padding: 8px;
    margin-bottom: 16px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  
  ul {
    list-style: none;
    padding: 0;
    margin: 0 0 16px 0;
  }
  
  li {
    padding: 8px;
    border-bottom: 1px solid #eee;
  }
  
  .create {
    display: flex;
    gap: 8px;
  }
  
  input {
    flex: 1;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  
  button {
    padding: 8px 16px;
    background: #0066cc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
</style>