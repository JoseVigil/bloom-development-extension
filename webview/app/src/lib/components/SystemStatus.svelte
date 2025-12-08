<script lang="ts">
  import { onMount } from 'svelte';
  import { getSystemStatus } from '../api';
  import { systemStatus } from '../stores/system';
  
  let loading = true;
  
  async function loadStatus() {
    loading = true;
    try {
      const status = await getSystemStatus();
      systemStatus.set(status);
    } catch (error) {
      console.error('Error loading system status:', error);
    } finally {
      loading = false;
    }
  }
  
  onMount(loadStatus);
</script>

<div class="status">
  <h3>Estado del Sistema</h3>
  
  {#if loading}
    <p>Verificando...</p>
  {:else}
    <div class="items">
      <div class="item">
        <span>Plugin:</span>
        <span class="indicator" class:active={$systemStatus.plugin}></span>
      </div>
      <div class="item">
        <span>Host:</span>
        <span class="indicator" class:active={$systemStatus.host}></span>
      </div>
      <div class="item">
        <span>Extension:</span>
        <span class="indicator" class:active={$systemStatus.extension}></span>
      </div>
    </div>
  {/if}
</div>

<style>
  .status {
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
  }
  
  h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
  }
  
  .items {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #dc3545;
  }
  
  .indicator.active {
    background: #28a745;
  }
</style>