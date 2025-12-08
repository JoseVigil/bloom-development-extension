<script lang="ts">
  import { goto } from '$app/navigation';
  
  function handleClick() {
    goto('/intents');
  }
</script>

<button on:click={handleClick}>
  Ir al navegador de Intents
</button>

<style>
  button {
    padding: 12px 24px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 16px;
    cursor: pointer;
  }
  
  button:hover {
    background: #218838;
  }
</style>