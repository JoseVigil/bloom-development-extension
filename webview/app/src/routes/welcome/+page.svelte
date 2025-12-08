<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import GithubAuthButton from '$lib/components/GithubAuthButton.svelte';
  
  onMount(() => {
    const success = $page.url.searchParams.get('success');
    if (success === '1') {
      goto('/home');
    }
  });
</script>

<div class="container">
  <div class="card">
    <h1>Bienvenido a BTIPS</h1>
    <p>Conecta tu cuenta de GitHub para comenzar</p>
    <GithubAuthButton />
  </div>
</div>

<style>
  .container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 20px;
  }
  
  .card {
    background: white;
    padding: 40px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    text-align: center;
    max-width: 400px;
    width: 100%;
  }
  
  h1 {
    margin: 0 0 16px 0;
    font-size: 28px;
    color: #333;
  }
  
  p {
    margin: 0 0 24px 0;
    color: #666;
    font-size: 16px;
  }
</style>