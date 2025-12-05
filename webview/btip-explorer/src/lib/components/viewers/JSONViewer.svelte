<script lang="ts">
	export let content: string;

	let parsed: any;
	let error: string | null = null;

	$: {
		try {
			parsed = JSON.parse(content);
			error = null;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to parse JSON';
			parsed = null;
		}
	}

	function syntaxHighlight(json: any): string {
		const str = JSON.stringify(json, null, 2);
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(
				/"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?/g,
				(match) => {
					let cls = 'json-string';
					if (/:$/.test(match)) {
						cls = 'json-key';
					}
					return `<span class="${cls}">${match}</span>`;
				}
			)
			.replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>')
			.replace(/\b(null)\b/g, '<span class="json-null">$1</span>')
			.replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="json-number">$1</span>');
	}
</script>

<div class="json-viewer">
	{#if error}
		<div class="error">
			<strong>Parse Error:</strong>
			{error}
		</div>
		<pre class="raw">{content}</pre>
	{:else}
		<pre class="formatted">{@html syntaxHighlight(parsed)}</pre>
	{/if}
</div>

<style>
	.json-viewer {
		font-family: var(--vscode-editor-font-family);
		font-size: 13px;
	}

	.error {
		padding: 12px;
		margin-bottom: 16px;
		background: var(--vscode-inputValidation-errorBackground);
		border: 1px solid var(--vscode-inputValidation-errorBorder);
		color: var(--vscode-errorForeground);
		border-radius: 4px;
	}

	.error strong {
		display: block;
		margin-bottom: 4px;
	}

	pre {
		margin: 0;
		padding: 0;
		white-space: pre-wrap;
		word-wrap: break-word;
		line-height: 1.6;
	}

	.formatted :global(.json-key) {
		color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
	}

	.formatted :global(.json-string) {
		color: var(--vscode-symbolIcon-stringForeground, #ce9178);
	}

	.formatted :global(.json-number) {
		color: var(--vscode-symbolIcon-numberForeground, #b5cea8);
	}

	.formatted :global(.json-boolean) {
		color: var(--vscode-symbolIcon-booleanForeground, #569cd6);
	}

	.formatted :global(.json-null) {
		color: var(--vscode-symbolIcon-nullForeground, #569cd6);
	}

	.raw {
		color: var(--vscode-editor-foreground);
	}
</style>