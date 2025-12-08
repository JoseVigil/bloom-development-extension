<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import FileTree from '$lib/components/FileTree.svelte';
  import { navigationStore } from '$lib/stores/navigation';
  import { websocketStore, refreshTree } from '$lib/stores/websocket';
  import { getTree, setBaseUrl } from '$lib/api';
  let currentProjectPath = '';
  let initialized = false;
  async function loadTree() {
    navigationStore.setLoading(true);
    navigationStore.setError(null);
   
    try {
      const tree = await getTree();
      navigationStore.setTree(tree);
    } catch (error) {
      navigationStore.setError(error instanceof Error ? error.message : String(error));
      console.error('Failed to load tree:', error);
    }
  }
  function handleVSCodeMessage(event: MessageEvent) {
    const message = event.data;
   
    if (message.type === 'config') {
      currentProjectPath = message.currentProjectPath || '';
     
      if (message.baseUrl) {
        setBaseUrl(message.baseUrl);
      }
     
      if (!initialized) {
        initialized = true;
        loadTree();
        websocketStore.connect();
      }
    } else if (message.type === 'btip:updated') {
      loadTree();
    }
  }
  onMount(() => {
    window.addEventListener('message', handleVSCodeMessage);
   
    websocketStore.onUpdate(() => {
      loadTree();
    });
    if (window.vscode) {
      window.vscode.postMessage({ type: 'ready' });
    } else {
      initialized = true;
      loadTree();
      websocketStore.connect();
    }
  });
  onDestroy(() => {
    window.removeEventListener('message', handleVSCodeMessage);
    websocketStore.disconnect();
  });
  function handleRefresh() {
    loadTree();
  }
</script>
<div class="btip-explorer">
  <header>
    <h1>BTIP Explorer</h1>
    {#if currentProjectPath}
      <p class="project-path">{currentProjectPath}</p>
    {/if}
    <button on:click={handleRefresh} class="refresh-btn">
      Refresh
    </button>
  </header>
  <main>
    {#if $navigationStore.loading}
      <div class="loading">Loading...</div>
    {:else if $navigationStore.error}
      <div class="error">
        <p>Error: {$navigationStore.error}</p>
        <button on:click={handleRefresh}>Retry</button>
      </div>
    {:else}
      <FileTree tree={$navigationStore.tree} />
    {/if}
  </main>
  <footer>
    <span class:connected={$websocketStore.connected}>
      {$websocketStore.connected ? '● Connected' : '○ Disconnected'}
    </span>
  </footer>
</div>
<style>
  .btip-explorer {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: system-ui, -apple-system, sans-serif;
    background: #1e1e1e;
    color: #d4d4d4;
  }
  header {
    padding: 1rem;
    border-bottom: 1px solid #333;
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
  .project-path {
    margin: 0;
    font-size: 0.875rem;
    color: #888;
    flex: 1;
  }
  .refresh-btn {
    padding: 0.5rem 1rem;
    background: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }
  .refresh-btn:hover {
    background: #005a9e;
  }
  main {
    flex: 1;
    overflow: auto;
    padding: 1rem;
  }
  .loading,
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
  }
  .error button {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  footer {
    padding: 0.5rem 1rem;
    border-top: 1px solid #333;
    font-size: 0.75rem;
    color: #888;
  }
  .connected {
    color: #4ec9b0;
  }
</style>