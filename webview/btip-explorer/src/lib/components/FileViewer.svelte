<script lang="ts">
	import { onMount } from 'svelte';
	import type { SelectedFile } from '$lib/stores/navigation';
	import JSONViewer from './viewers/JSONViewer.svelte';
	import BLViewer from './viewers/BLViewer.svelte';
	import TextViewer from './viewers/TextViewer.svelte';

	export let file: SelectedFile;

	function getViewer(ext: string) {
		switch (ext) {
			case '.json':
				return JSONViewer;
			case '.bl':
			case '.tree':
				return BLViewer;
			default:
				return TextViewer;
		}
	}

	$: viewer = getViewer(file.ext);
	$: formattedSize = formatSize(file.size);

	function formatSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' bytes';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}
</script>

<div class="file-viewer">
	<div class="viewer-header">
		<div class="file-info">
			<span class="file-name">{file.name}</span>
			<span class="file-meta">{formattedSize}</span>
		</div>
		<div class="file-path">{file.path}</div>
	</div>
	<div class="viewer-content">
		<svelte:component this={viewer} content={file.content} />
	</div>
</div>

<style>
	.file-viewer {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--vscode-editor-background);
	}

	.viewer-header {
		padding: 12px 16px;
		border-bottom: 1px solid var(--vscode-editorGroup-border);
		background: var(--vscode-editor-background);
	}

	.file-info {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 4px;
	}

	.file-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--vscode-foreground);
	}

	.file-meta {
		font-size: 12px;
		color: var(--vscode-descriptionForeground);
	}

	.file-path {
		font-size: 11px;
		font-family: var(--vscode-editor-font-family);
		color: var(--vscode-descriptionForeground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.viewer-content {
		flex: 1;
		overflow: auto;
		padding: 16px;
	}
</style>