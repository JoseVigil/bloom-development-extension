<script lang="ts">
	export let content: string;
</script>

<div class="text-viewer">
	<pre>{content}</pre>
</div>

<style>
	.text-viewer {
		font-family: var(--vscode-editor-font-family);
		font-size: 13px;
		line-height: 1.6;
	}

	pre {
		margin: 0;
		padding: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
		color: var(--vscode-editor-foreground);
	}
</style>