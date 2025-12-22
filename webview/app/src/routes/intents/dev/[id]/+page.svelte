// routes/intent/dev/[id]/+page.svelte
<script lang="ts">
  import DevIntentView from '$lib/views/DevIntentView.svelte';
  export let data;
</script>

<DevIntentView intentId={data.id} />