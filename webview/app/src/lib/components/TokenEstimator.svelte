<script lang="ts">
  import { onMount } from 'svelte';
  // import { estimateTokens } from '$lib/api'; // ← NO EXISTE
  import { Loader } from 'lucide-svelte';
  
  export let content: string;
  
  let tokens = 0;
  let loading = false;
  let error: string | null = null;
  
  // Función local para estimar tokens (aproximación: 1 token ≈ 4 caracteres)
  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
  
  $: if (content) {
    estimateContent();
  }
  
  function estimateContent() {
    loading = true;
    error = null;
    try {
      tokens = estimateTokens(content);
    } catch (err) {
      error = 'Failed to estimate';
      tokens = Math.floor(content.length / 4);
    } finally {
      loading = false;
    }
  }
  
  onMount(estimateContent);
</script>

<div class="token-estimator">
  <h3>Token Estimator</h3>
  
  <div class="estimate-card">
    {#if loading}
      <div class="loading">
        <Loader class="spin" size={24} />
      </div>
    {:else}
      <div class="token-count">{tokens.toLocaleString()}</div>
      <div class="token-label">estimated tokens</div>
    {/if}
  </div>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  <div class="quota-warning">
    <p>⚠️ Check account quotas before executing</p>
  </div>
</div>

<style>
  .token-estimator {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .estimate-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 1.5rem;
    border-radius: 8px;
    text-align: center;
    min-height: 100px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .loading {
    color: white;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .token-count {
    font-size: 2rem;
    font-weight: 700;
    color: white;
    margin-bottom: 0.25rem;
  }

  .token-label {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.9);
  }

  .error {
    padding: 0.75rem;
    background: #ef4444;
    color: white;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .quota-warning {
    padding: 0.75rem;
    background: #f59e0b;
    color: white;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .quota-warning p {
    margin: 0;
  }
</style>