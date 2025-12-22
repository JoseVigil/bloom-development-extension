// routes/intent/doc/[id]/+page.svelte
<script lang="ts">
  import DocIntentView from '$lib/views/DocIntentView.svelte';
  export let data;
</script>

<DocIntentView intentId={data.id} />