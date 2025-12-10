<script lang="ts">
  import { onMount } from 'svelte';
  import { onboardingStore } from '$lib/stores/onboarding';
  import { websocketStore } from '$lib/stores/websocket';
  import OnboardingWizard from '$lib/components/OnboardingWizard.svelte';
  import GithubAuthButton from '$lib/components/GithubAuthButton.svelte';
  import GeminiTokenForm from '$lib/components/GeminiTokenForm.svelte';
  import NucleusPanel from '$lib/components/NucleusPanel.svelte';
  import ProjectsPanel from '$lib/components/ProjectsPanel.svelte';
  import { goto } from '$app/navigation';
  
  $: currentStep = $onboardingStore.step;
  
  onMount(async () => {
    await onboardingStore.checkAuth();
    
    if ($onboardingStore.completed) {
      goto('/intents');
    }
    
    websocketStore.on('auth:updated', () => {
      onboardingStore.checkAuth();
    });
  });
  
  function handleNext() {
    onboardingStore.nextStep();
  }
  
  function handleComplete() {
    onboardingStore.complete();
    goto('/intents');
  }
</script>

<OnboardingWizard step={currentStep}>
  {#if currentStep === 'welcome'}
    <div class="step-content">
      <h1>Bienvenido a BTIP Studio</h1>
      <p>Conecta tu cuenta de GitHub para comenzar</p>
      <GithubAuthButton />
      {#if $onboardingStore.githubAuthenticated}
        <button on:click={handleNext} class="btn-next">Continuar</button>
      {/if}
    </div>
  {:else if currentStep === 'gemini'}
    <div class="step-content">
      <h1>Configurar Gemini API</h1>
      <GeminiTokenForm />
      {#if $onboardingStore.geminiConfigured}
        <button on:click={handleNext} class="btn-next">Continuar</button>
      {/if}
    </div>
  {:else if currentStep === 'nucleus'}
    <div class="step-content">
      <h1>Crear Nucleus</h1>
      <NucleusPanel />
      {#if $onboardingStore.hasNucleus}
        <button on:click={handleNext} class="btn-next">Continuar</button>
      {/if}
    </div>
  {:else if currentStep === 'projects'}
    <div class="step-content">
      <h1>Configurar Proyectos</h1>
      <ProjectsPanel />
      {#if $onboardingStore.hasProjects}
        <button on:click={handleComplete} class="btn-complete">Finalizar</button>
      {/if}
    </div>
  {/if}
</OnboardingWizard>

<style>
  .step-content {
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  h1 {
    margin: 0 0 1rem;
    font-size: 2rem;
  }
  
  p {
    margin: 0 0 2rem;
    color: var(--text-secondary);
  }
  
  .btn-next, .btn-complete {
    margin-top: 2rem;
    padding: 0.75rem 2rem;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
  }
  
  .btn-complete {
    background: #10b981;
  }
</style>