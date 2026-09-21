<script lang="ts">
  // src/lib/components/OrreryContainer.svelte
  //
  // Mecanismo de Montaje — Spec_Implementacion_Integracion_Core_Orrery_v1_0.md
  // §3.1. Envoltura de ciclo de vida sobre mountOrreryScene() (extraído de
  // installer/conductor/workspace/core/orrery/src/main.ts) — no reimplementa
  // el motor de cámara/selección, solo lo monta/actualiza/desmonta.
  //
  // HUD de orientación: vive acá, superpuesto al <canvas> de PlayCanvas
  // (nunca dentro de él) — mantiene la frontera de v0.1 §0. El botón "Volver"
  // es el mínimo exigido (retorno explícito, nunca gesto implícito, v0.1
  // §3.2); breadcrumb y foco quedan fuera de esta Spec (§1.8).

  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { mountOrreryScene, type OrreryHandle } from '$orrery/main';
  import type { OrreryTree } from '$orrery/locationTree';

  export let tree: OrreryTree;

  const dispatch = createEventDispatcher<{ exit: void }>();
  let root: HTMLDivElement;
  let handle: OrreryHandle | undefined;

  onMount(() => {
    handle = mountOrreryScene(root, tree);
  });

  onDestroy(() => {
    handle?.destroy();
  });

  // Un solo árbol de escena por sesión (v0.2 §2.4) — un cambio de `tree`
  // actualiza la escena montada, nunca desmonta/remonta mountOrreryScene().
  $: if (handle && tree) {
    handle.update(tree);
  }
</script>

<div class="orrery-root" bind:this={root}></div>
<button type="button" class="orrery-exit" on:click={() => dispatch('exit')}>Volver</button>

<style>
  /* 100% del viewport — v0.2 §1, sin excepción de contenedor dominante ni
     layout compartido con el régimen Panel. */
  .orrery-root {
    position: fixed;
    inset: 0;
    z-index: 50;
  }

  .orrery-exit {
    position: fixed;
    top: 1rem;
    left: 1rem;
    z-index: 51;
    padding: 0.5rem 1rem;
    background: rgba(13, 17, 23, 0.85);
    color: #e8eaf0;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.06em;
    cursor: pointer;
  }

  .orrery-exit:hover {
    background: rgba(19, 24, 32, 0.95);
  }
</style>
