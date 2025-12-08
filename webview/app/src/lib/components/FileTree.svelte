<script lang="ts">
  import type { BTIPNode } from '../api';
  import { getFile } from '../api';
  import { navigationStore } from '../stores/navigation';

  export let tree: BTIPNode[];
  export let level: number = 0;

  let selectedFile: { path: string; content: string; extension: string } | null = null;
  let loading = false;

  async function handleFileClick(node: BTIPNode) {
    if (node.type === 'directory') {
      navigationStore.toggleExpanded(node.path);
    } else {
      loading = true;
      try {
        const file = await getFile(node.path);
        selectedFile = file;
        navigationStore.setSelectedPath(node.path);
      } catch (error) {
        console.error('Failed to load file:', error);
      } finally {
        loading = false;
      }
    }
  }

  function getIcon(node: BTIPNode): string {
    if (node.type === 'directory') {
      return '📁';
    }
    const ext = node.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'bl':
        return '📄';
      case 'json':
        return '📋';
      case 'txt':
        return '📝';
      default:
        return '📄';
    }
  }
</script>

<div class="file-tree">
  {#each tree as node}
    <div class="node" style="padding-left: {level * 1.5}rem">
      <button
        class="node-button"
        class:selected={$navigationStore.selectedPath === node.path}
        on:click={() => handleFileClick(node)}
      >
        <span class="icon">{getIcon(node)}</span>
        <span class="name">{node.name}</span>
      </button>

      {#if node.type === 'directory' && node.children && $navigationStore.expandedPaths.has(node.path)}
        <svelte:self tree={node.children} level={level + 1} />
      {/if}
    </div>
  {/each}

  {#if selectedFile}
    <div class="file-viewer">
      <div class="file-header">
        <h3>{selectedFile.path.split('/').pop()}</h3>
        <button on:click={() => selectedFile = null}>Close</button>
      </div>
      <pre class="file-content">{selectedFile.content}</pre>
    </div>
  {/if}

  {#if loading}
    <div class="loading-overlay">Loading file...</div>
  {/if}
</div>

<style>
  .file-tree {
    position: relative;
  }

  .node {
    margin: 0;
  }

  .node-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: #d4d4d4;
    cursor: pointer;
    text-align: left;
    font-size: 0.875rem;
    border-radius: 4px;
  }

  .node-button:hover {
    background: #2a2d2e;
  }

  .node-button.selected {
    background: #094771;
  }

  .icon {
    flex-shrink: 0;
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
    max-width: 800px;
    max-height: 80vh;
    background: #252526;
    border: 1px solid #333;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    z-index: 1000;
  }

  .file-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #333;
  }

  .file-header h3 {
    margin: 0;
    font-size: 1rem;
  }

  .file-header button {
    padding: 0.25rem 0.75rem;
    background: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .file-content {
    flex: 1;
    overflow: auto;
    padding: 1rem;
    margin: 0;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
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
    font-size: 1.25rem;
    z-index: 999;
  }
</style>