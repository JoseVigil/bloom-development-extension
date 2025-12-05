<script lang="ts">
	export let content: string;

	function highlightBL(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/^(#.*)$/gm, '<span class="bl-comment">$1</span>')
			.replace(/^(\[.*\])$/gm, '<span class="bl-section">$1</span>')
			.replace(/^(\w+):/gm, '<span class="bl-key">$1</span>:')
			.replace(/\b(true|false|null)\b/g, '<span class="bl-value">$1</span>');
	}
</script>

<div class="bl-viewer">
	<pre>{@html highlightBL(content)}</pre>
</div>

<style>
	.bl-viewer {
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

	.bl-viewer :global(.bl-comment) {
		color: var(--vscode-symbolIcon-textForeground, #6a9955);
		font-style: italic;
	}

	.bl-viewer :global(.bl-section) {
		color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
		font-weight: 600;
	}

	.bl-viewer :global(.bl-key) {
		color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
	}

	.bl-viewer :global(.bl-value) {
		color: var(--vscode-symbolIcon-keywordForeground, #569cd6);
	}
</style>