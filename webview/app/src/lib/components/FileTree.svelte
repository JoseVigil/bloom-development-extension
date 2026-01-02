<script lang="ts">
  // import type { BTIPNode } from '$lib/api'; // ← NO EXISTE
  // import { getFile } from '$lib/api'; // ← NO EXISTE
  import { Folder, File, ChevronRight, ChevronDown } from 'lucide-svelte';
  
  // Definir tipo localmente
  type BTIPNode = {
    path: string;
    name: string;
    type: 'file' | 'directory';
    children?: BTIPNode[];
  };
  
  export let tree: BTIPNode[] = [];
  export let level: number = 0;
  export let mode: 'nucleus' | 'explorer' | 'files-chooser' = 'explorer';
  
  let expanded = new Set<string>();
  let selectedFile: { path: string; content: string; extension: string } | null = null;
  let loading = false;
  
  async function handleClick(node: BTIPNode) {
    if (node.type === 'directory') {
      if (expanded.has(node.path)) {
        expanded.delete(node.path);
      } else {
        expanded.add(node.path);
      }
      expanded = expanded;
    } else {
      loading = true;
      try {
        // Simular carga de archivo por ahora
        selectedFile = {
          path: node.path,
          content: 'File content will be loaded here...',
          extension: node.name.split('.').pop() || ''
        };
        
        if (typeof window !== 'undefined' && (window as any).vscode) {
          (window as any).vscode.postMessage({
            command: 'openFile',
            path: node.path
          });
        }
      } catch (error) {
        console.error('Failed to load file:', error);
        if (typeof window !== 'undefined' && !(window as any).vscode) {
          alert('Open in VSCode required');
        }
      } finally {
        loading = false;
      }
    }
  }
  
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }
  
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    console.log('File dropped:', event.dataTransfer?.files);
  }
</script>

<div class="file-tree" role="tree" on:dragover={handleDragOver} on:drop={handleDrop}>
  {#if tree.length === 0}
    <div class="empty">No files</div>
  {:else}
    {#each tree as node (node.path)}
      <div class="node" style="padding-left: {level * 16}px">
        <button
          class="node-button"
          on:click={() => handleClick(node)}
          aria-label={node.name}
        >
          {#if node.type === 'directory'}
            {#if expanded.has(node.path)}
              <ChevronDown size={16} />
            {:else}
              <ChevronRight size={16} />
            {/if}
            <Folder size={16} />
          {:else}
            <File size={16} />
          {/if}
          <span class="name">{node.name}</span>
        </button>
        
        {#if node.type === 'directory' && expanded.has(node.path) && node.children}
          <svelte:self tree={node.children} level={level + 1} {mode} />
        {/if}
      </div>
    {/each}
  {/if}
</div>

{#if selectedFile}
  <div class="file-viewer">
    <div class="viewer-header">
      <h3>{selectedFile.path.split('/').pop()}</h3>
      <button on:click={() => selectedFile = null}>Close</button>
    </div>
    <pre class="viewer-content">{selectedFile.content}</pre>
  </div>
{/if}

{#if loading}
  <div class="loading-overlay">Loading...</div>
{/if}

<style>
  .file-tree {
    font-size: 0.875rem;
  }

  .empty {
    padding: 1rem;
    text-align: center;
    color: var(--text-secondary);
  }

  .node {
    margin: 0;
  }

  .node-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .node-button:hover {
    background: var(--bg-tertiary);
  }

  .node-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-viewer {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 80%;
    max-width: 900px;
    max-height: 80vh;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    z-index: 1000;
  }

  .viewer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--border-color);
  }

  .viewer-header h3 {
    margin: 0;
    font-size: 1rem;
  }

  .viewer-header button {
    padding: 0.25rem 0.75rem;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .viewer-content {
    flex: 1;
    overflow: auto;
    padding: 1rem;
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    z-index: 999;
  }
</style>