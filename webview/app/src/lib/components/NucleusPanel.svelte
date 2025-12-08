<script lang="ts">
  import { onMount } from 'svelte';
  import { getNucleusList, createNucleus } from '../api';
  import type { Nucleus } from '../types';
  
  let nuclei: Nucleus[] = [];
  let loading = false;
  let newName = '';
  let creating = false;
  
  async function loadNuclei() {
    loading = true;
    try {
      const result = await getNucleusList();
      nuclei = result.nuclei || [];
    } catch (error) {
      console.error('Error loading nuclei:', error);
    } finally {
      loading = false;
    }
  }
  
  async function handleCreate() {
    if (!newName.trim()) return;
    
    creating = true;
    try {
      await createNucleus(newName);
      newName = '';
      await loadNuclei();
    } catch (error) {
      console.error('Error creating nucleus:', error);
    } finally {
      creating = false;
    }
  }
  
  onMount(loadNuclei);
</script>

<div class="panel">
  <h3>Nucleus</h3>
  
  {#if loading}
    <p>Cargando...</p>
  {:else}
    <ul>
      {#each nuclei as nucleus}
        <li>{nucleus.name}</li>
      {/each}
    </ul>
  {/if}
  
  <div class="create">
    <input 
      type="text" 
      bind:value={newName} 
      placeholder="Nombre del nuevo nucleus"
      disabled={creating}
    />
    <button on:click={handleCreate} disabled={creating || !newName.trim()}>
      {creating ? 'Creando...' : 'Crear'}
    </button>
  </div>
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