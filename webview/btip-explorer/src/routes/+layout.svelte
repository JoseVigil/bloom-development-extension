<script lang="ts">
	import { onMount } from 'svelte';
	import { ws, connect } from '$lib/stores/websocket';
	import '$lib/styles/global.css';

	onMount(() => {
		connect();
	});
</script>

<div class="app">
	<slot />
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100vh;
		overflow: hidden;
	}
</style>