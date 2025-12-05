<script lang="ts">
	import { expandedNodes, toggleNode, selectFile, updateNodeChildren } from '$lib/stores/navigation';
	import { send, on } from '$lib/stores/websocket';
	import { onMount } from 'svelte';
	import type { BTIPNode } from '$lib/stores/navigation';

	export let node: BTIPNode;
	export let depth: number = 0;

	$: isExpanded = $expandedNodes.has(node.path);
	$: hasChildren = node.type === 'directory';

	function handleClick() {
		if (node.type === 'directory') {
			toggleNode(node.path);
			if (!isExpanded && (!node.children || node.children.length === 0)) {
				send({ event: 'list_directory', path: node.path });
			}
		} else {
			send({ event: 'open_file', path: node.path });
		}
	}

	onMount(() => {
		const unsubscribe = on('file_content', (message) => {
			if (message.path === node.path) {
				selectFile({
					path: message.path,
					name: node.name,
					content: message.content,
					ext: message.ext || node.ext || '',
					size: message.size || node.size || 0
				});
			}
		});

		const unsubscribeList = on('directory_list', (message) => {
			if (message.path === node.path) {
				updateNodeChildren(node.path, message.items || []);
			}
		});

		return () => {
			unsubscribe();
			unsubscribeList();
		};
	});

	function getIcon(node: BTIPNode): string {
		if (node.type === 'directory') {
			return isExpanded ? '📂' : '📁';
		}

		const ext = node.ext || '';
		switch (ext) {
			case '.json':
				return '📄';
			case '.bl':
				return '📝';
			case '.md':
				return '📋';
			case '.tree':
				return '🌲';
			default:
				return '📄';
		}
	}
</script>

<li class="tree-node">
	<div
		class="node-content"
		class:directory={node.type === 'directory'}
		class:expanded={isExpanded}
		style="padding-left: {depth * 16 + 8}px"
		on:click={handleClick}
		on:keydown={(e) => e.key === 'Enter' && handleClick()}
		role="button"
		tabindex="0"
	>
		{#if hasChildren}
			<span class="chevron" class:expanded={isExpanded}>
				{isExpanded ? '▼' : '▶'}
			</span>
		{:else}
			<span class="chevron spacer"></span>
		{/if}
		<span class="icon">{getIcon(node)}</span>
		<span class="name">{node.name}</span>
		{#if node.type === 'file' && node.size}
			<span class="size">{formatSize(node.size)}</span>
		{/if}
	</div>

	{#if hasChildren && isExpanded && node.children}
		<ul class="children">
			{#each node.children as child}
				<svelte:self node={child} depth={depth + 1} />
			{/each}
		</ul>
	{/if}
</li>

<script context="module" lang="ts">
	function formatSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}
</script>

<style>
	.tree-node {
		list-style: none;
	}

	.node-content {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		cursor: pointer;
		white-space: nowrap;
		transition: background-color 0.1s;
	}

	.node-content:hover {
		background: var(--vscode-list-hoverBackground);
	}

	.node-content:focus {
		outline: 1px solid var(--vscode-focusBorder);
		outline-offset: -1px;
	}

	.chevron {
		width: 12px;
		font-size: 10px;
		color: var(--vscode-foreground);
		transition: transform 0.1s;
		display: inline-block;
	}

	.chevron.spacer {
		visibility: hidden;
	}

	.icon {
		font-size: 14px;
	}

	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--vscode-foreground);
	}

	.size {
		font-size: 11px;
		color: var(--vscode-descriptionForeground);
		margin-left: auto;
	}

	.children {
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>