<!--
  Route stub — Tarea 1.2. La ruta /profiles nunca tuvo un +page.svelte real
  pese a que el Sidebar la linkeaba (confirmado: SvelteKitError "Not found").
  Este stub solo hace que la navegación no rompa. La vista real de Profiles
  (listado vía nucleus:list-profiles, accounts por perfil, master profile)
  es Tarea 2 — explícitamente no se toca acá.
-->
<div class="stub">
  <span class="stub-label">Profiles</span>
  <span class="stub-note">Próximamente</span>
</div>

<style>
  .stub {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #e8eaf0;
    background: #080a0e;
  }

  .stub-label {
    font-family: 'Syne', sans-serif;
    font-size: 15px;
    font-weight: 600;
  }

  .stub-note {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(232, 234, 240, 0.45);
  }
</style>
