<script lang="ts">
	import { onMount } from 'svelte';
	import { btipTree, expandedNodes, toggleNode } from '$lib/stores/navigation';
	import { on, send } from '$lib/stores/websocket';
	import TreeNode from './TreeNode.svelte';
	import type { BTIPNode } from '$lib/stores/navigation';

	let loading = true;

	onMount(() => {
		const unsubscribe = on('tree_snapshot', (message) => {
			if (message.structure) {
				btipTree.set(message.structure);
				loading = false;
			}
		});

		// Request initial tree
		send({ event: 'list_directory', path: '' });

		return unsubscribe;
	});
</script>

<div class="file-tree">
	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
			<span>Loading BTIP structure...</span>
		</div>
	{:else if $btipTree.length === 0}
		<div class="empty">
			<p>No .bloom directory found</p>
		</div>
	{:else}
		<ul class="tree-root">
			{#each $btipTree as node}
				<TreeNode {node} depth={0} />
			{/each}
		</ul>
	{/if}
</div>

<style>
	.file-tree {
		padding: 8px 0;
		font-size: 13px;
		font-family: var(--vscode-editor-font-family);
		user-select: none;
	}

	.tree-root {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.loading,
	.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		color: var(--vscode-descriptionForeground);
	}

	.loading {
		flex-direction: column;
		gap: 12px;
	}

	.spinner {
		border: 2px solid var(--vscode-editor-background);
		border-top: 2px solid var(--vscode-button-background);
		border-radius: 50%;
		width: 24px;
		height: 24px;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.empty p {
		margin: 0;
		font-size: 12px;
	}
</style>