<script lang="ts">
	import FileTree from '$lib/components/FileTree.svelte';
	import FileViewer from '$lib/components/FileViewer.svelte';
	import { selectedFile, currentPath } from '$lib/stores/navigation';

	let treeWidth = 300;
	let isResizing = false;

	function startResize() {
		isResizing = true;
	}

	function resize(e: MouseEvent) {
		if (!isResizing) return;
		const newWidth = Math.max(200, Math.min(600, e.clientX));
		treeWidth = newWidth;
	}

	function stopResize() {
		isResizing = false;
	}
</script>

<svelte:window on:mousemove={resize} on:mouseup={stopResize} />

<div class="explorer">
	<div class="sidebar" style="width: {treeWidth}px">
		<div class="sidebar-header">
			<h2>BTIP Explorer</h2>
			<div class="path">{$currentPath || '/.bloom'}</div>
		</div>
		<div class="tree-container">
			<FileTree />
		</div>
	</div>

	<div class="resizer" on:mousedown={startResize}></div>

	<div class="content">
		{#if $selectedFile}
			<FileViewer file={$selectedFile} />
		{:else}
			<div class="empty-state">
				<div class="empty-content">
					<h3>No file selected</h3>
					<p>Select a file from the tree to view its contents</p>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.explorer {
		display: flex;
		height: 100vh;
		background: var(--vscode-editor-background);
		color: var(--vscode-editor-foreground);
	}

	.sidebar {
		display: flex;
		flex-direction: column;
		background: var(--vscode-sideBar-background);
		border-right: 1px solid var(--vscode-sideBar-border);
		min-width: 200px;
		max-width: 600px;
	}

	.sidebar-header {
		padding: 12px 16px;
		border-bottom: 1px solid var(--vscode-sideBar-border);
	}

	.sidebar-header h2 {
		margin: 0 0 8px 0;
		font-size: 14px;
		font-weight: 600;
		color: var(--vscode-foreground);
	}

	.path {
		font-size: 11px;
		font-family: var(--vscode-editor-font-family);
		color: var(--vscode-descriptionForeground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tree-container {
		flex: 1;
		overflow: auto;
	}

	.resizer {
		width: 4px;
		cursor: col-resize;
		background: transparent;
		position: relative;
	}

	.resizer:hover {
		background: var(--vscode-sash-hoverBorder);
	}

	.content {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
	}

	.empty-content {
		text-align: center;
		color: var(--vscode-descriptionForeground);
	}

	.empty-content h3 {
		margin: 0 0 8px 0;
		font-size: 16px;
		font-weight: 500;
	}

	.empty-content p {
		margin: 0;
		font-size: 13px;
	}
</style>