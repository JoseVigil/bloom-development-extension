<script lang="ts">
  import { goto } from '$app/navigation';

  export let intentId: string;
</script>

<section class="intent-view" aria-labelledby="doc-intent-title">
  <button type="button" class="back" on:click={() => goto('/intents')}>← Intents</button>
  <p class="eyebrow">Intent · documentación</p>
  <h1 id="doc-intent-title">{intentId}</h1>
  <p class="message">
    La vista especializada de documentación todavía no está implementada. El Intent permanece disponible
    desde la vista general, sin iniciar ni modificar su ejecución desde esta pantalla.
  </p>
</section>

<style>
  .intent-view { max-width: 720px; margin: 0 auto; padding: 3rem 2rem; color: var(--text-primary); }
  .back { border: 0; background: transparent; color: var(--text-secondary); cursor: pointer; padding: 0; }
  .eyebrow { margin-top: 2rem; color: var(--accent); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; }
  h1 { margin: 0.5rem 0 1rem; overflow-wrap: anywhere; }
  .message { color: var(--text-secondary); line-height: 1.6; }
</style>
