<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // La raíz "/" no tiene contenido propio: el home real es /home.
  // (Antes esto dependía del layout redirigiendo según onboardingStore,
  // que ya no gatea nada acá. Redirect directo y simple.)
  onMount(() => {
    goto('/home');
  });
</script>

<div class="redirect-screen">
  <div class="spinner"></div>
</div>

<style>
  .redirect-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: var(--bg-primary, #1e1e1e);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(139, 92, 246, 0.1);
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
