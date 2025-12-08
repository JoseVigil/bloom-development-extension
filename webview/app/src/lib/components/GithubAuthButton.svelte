<script lang="ts">
  function handleAuth() {
    window.location.href = 'http://localhost:5888/btip/auth/github/start';
  }
</script>

<button on:click={handleAuth}>
  Conectar GitHub
</button>

<style>
  button {
    padding: 12px 24px;
    background: #24292e;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 16px;
    cursor: pointer;
  }
  
  button:hover {
    background: #1b1f23;
  }
</style>