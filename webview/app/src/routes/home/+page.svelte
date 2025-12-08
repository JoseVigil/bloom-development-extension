<script lang="ts">
  import SystemStatus from '$lib/components/SystemStatus.svelte';
  import GeminiTokenForm from '$lib/components/GeminiTokenForm.svelte';
  import NucleusPanel from '$lib/components/NucleusPanel.svelte';
  import ProjectsPanel from '$lib/components/ProjectsPanel.svelte';
  import IntentsLink from '$lib/components/IntentsLink.svelte';
</script>

<div class="container">
  <header>
    <h1>BTIPS Dashboard</h1>
  </header>
  
  <main>
    <section class="row">
      <SystemStatus />
    </section>
    
    <section class="row">
      <GeminiTokenForm />
    </section>
    
    <section class="row">
      <div class="col">
        <NucleusPanel />
      </div>
      <div class="col">
        <ProjectsPanel />
      </div>
    </section>
    
    <section class="row">
      <IntentsLink />
    </section>
  </main>
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }
  
  header {
    background: white;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  h1 {
    margin: 0;
    font-size: 24px;
    color: #333;
  }
  
  main {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  
  .row {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    display: flex;
    gap: 20px;
  }
  
  .col {
    flex: 1;
  }
</style>