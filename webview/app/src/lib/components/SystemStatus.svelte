<script lang="ts">
  import { onMount } from 'svelte';
  import { getSystemStatus } from '$lib/api';
  import { systemStatus } from '$lib/stores/system';
  
  export let mode: 'badge' | 'full' = 'full';
  
  let loading = true;
  
  async function loadStatus() {
    loading = true;
    try {
      const status = await getSystemStatus();
      systemStatus.set({
        plugin: status.status === 'ok',
        host: false,
        extension: true
      });
    } catch (error) {
      console.error('Error loading system status:', error);
    } finally {
      loading = false;
    }
  }
  
  onMount(loadStatus);
</script>

{#if mode === 'badge'}
  <div class="badge">
    <span class="dot" class:active={$systemStatus.plugin}></span>
    <span class="text">System</span>
  </div>
{:else}
  <div class="status">
    <h3>System Status</h3>
    
    {#if loading}
      <p>Checking...</p>
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
{/if}

<style>
  .badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--bg-tertiary);
    border-radius: 12px;
    font-size: 0.75rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #dc3545;
  }

  .dot.active {
    background: #28a745;
  }
  
  .text {
    color: var(--text-primary);
    font-weight: 500;
  }
  
  .status {
    padding: 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }
  
  h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    font-weight: 600;
  }
  
  .items {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
  }
  
  .indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #dc3545;
  }
  
  .indicator.active {
    background: #28a745;
  }
</style>