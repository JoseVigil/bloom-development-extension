<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onboardingStore } from '$lib/stores/onboarding';
  import CopilotChat from '$lib/components/CopilotChat.svelte';
  
  // Import step components
  import GithubAuthButton from '$lib/components/GithubAuthButton.svelte';
  import GeminiTokenForm from '$lib/components/GeminiTokenForm.svelte';
  import NucleusPanel from '$lib/components/NucleusPanel.svelte';
  import ProjectsPanel from '$lib/components/ProjectsPanel.svelte';

  const steps = [
    { id: 'welcome', label: 'GitHub', number: 1 },
    { id: 'gemini', label: 'Gemini', number: 2 },
    { id: 'nucleus', label: 'Nucleus', number: 3 },
    { id: 'projects', label: 'Proyectos', number: 4 }
  ];

  $: currentIndex = steps.findIndex(s => s.id === $onboardingStore.step);
  $: canAdvance = checkCanAdvance($onboardingStore);

  function checkCanAdvance(store: typeof $onboardingStore): boolean {
    switch (store.step) {
      case 'welcome':
        return store.githubAuthenticated;
      case 'gemini':
        return store.geminiConfigured;
      case 'nucleus':
        return store.hasNucleus;
      case 'projects':
        return store.hasProjects;
      default:
        return false;
    }
  }

  async function handleNext() {
    const nextSteps = ['welcome', 'gemini', 'nucleus', 'projects'];
    const currentIdx = nextSteps.indexOf($onboardingStore.step);
    
    if (currentIdx < nextSteps.length - 1) {
      onboardingStore.setStep(nextSteps[currentIdx + 1] as any);
    } else {
      await onboardingStore.complete();
    }
  }

  function handlePrevious() {
    const prevSteps = ['welcome', 'gemini', 'nucleus', 'projects'];
    const currentIdx = prevSteps.indexOf($onboardingStore.step);
    
    if (currentIdx > 0) {
      onboardingStore.setStep(prevSteps[currentIdx - 1] as any);
    }
  }
</script>

<div class="wizard-grid">
  <div class="main">
    <!-- Progress Bar -->
    <div class="progress-bar" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={4}>
      <div class="steps">
        {#each steps as s, i}
          <div class="step" class:active={i === currentIndex} class:completed={i < currentIndex}>
            <div class="step-number">{i < currentIndex ? '✓' : s.number}</div>
            <div class="step-label">{s.label}</div>
          </div>
        {/each}
      </div>
      <div class="progress-fill" style="width: {((currentIndex + 1) / steps.length) * 100}%"></div>
    </div>
    
    <!-- Content Area with Step Components -->
    <div class="content" in:fly={{ y: 20, duration: 300 }}>
      {#if $onboardingStore.loading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Cargando configuración...</p>
        </div>
      {:else if $onboardingStore.error}
        <div class="error-state">
          <p class="error-message">⚠️ {$onboardingStore.error}</p>
          <button on:click={() => onboardingStore.refresh()}>
            Reintentar
          </button>
        </div>
      {:else}
        <!-- WELCOME STEP: GitHub Auth -->
        {#if $onboardingStore.step === 'welcome'}
          <div class="step-content">
            <h2>🚀 Bienvenido a Bloom Nucleus</h2>
            <p>Primero, conecta tu cuenta de GitHub para acceder a tus repositorios.</p>
            
            {#if $onboardingStore.githubAuthenticated}
              <div class="success-message">
                ✅ GitHub conectado exitosamente
              </div>
            {:else}
              <GithubAuthButton />
            {/if}
          </div>
        
        <!-- GEMINI STEP: API Key Configuration -->
        {:else if $onboardingStore.step === 'gemini'}
          <div class="step-content">
            <h2>🤖 Configurar Gemini AI</h2>
            <p>Agrega tu API key de Google Gemini para habilitar asistencia con IA.</p>
            
            {#if $onboardingStore.geminiConfigured}
              <div class="success-message">
                ✅ Gemini configurado correctamente
              </div>
            {:else}
              <GeminiTokenForm />
            {/if}
          </div>
        
        <!-- NUCLEUS STEP: Create Organization -->
        {:else if $onboardingStore.step === 'nucleus'}
          <div class="step-content">
            <h2>🏢 Crear Nucleus</h2>
            <p>Un Nucleus es tu espacio de trabajo organizacional para gestionar proyectos.</p>
            
            <NucleusPanel />
          </div>
        
        <!-- PROJECTS STEP: Add Projects -->
        {:else if $onboardingStore.step === 'projects'}
          <div class="step-content">
            <h2>📁 Agregar Proyectos</h2>
            <p>Vincula proyectos existentes o clona nuevos repositorios a tu Nucleus.</p>
            
            <ProjectsPanel />
          </div>
        {/if}
      {/if}

      <!-- Navigation Buttons -->
      {#if !$onboardingStore.loading && !$onboardingStore.error}
        <div class="navigation">
          <button 
            class="btn-secondary" 
            on:click={handlePrevious}
            disabled={currentIndex === 0}
          >
            ← Anterior
          </button>
          
          <button 
            class="btn-primary" 
            on:click={handleNext}
            disabled={!canAdvance}
          >
            {currentIndex === steps.length - 1 ? 'Finalizar' : 'Siguiente →'}
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Copilot Sidebar -->
  <div class="sidebar">
    <h3>💬 Copilot Assistant</h3>
    <CopilotChat />
  </div>
</div>

<style>
  .wizard-grid {
    display: grid;
    grid-template-columns: 1fr 320px;
    min-height: 100vh;
    padding: 2rem;
    gap: 2rem;
    background: var(--bg-primary, #f5f5f5);
  }

  .main {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .sidebar {
    background: var(--bg-secondary, white);
    padding: 1.5rem;
    border-radius: 12px;
    border: 1px solid var(--border-color, #e0e0e0);
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  }

  h3 {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
    color: var(--text-primary, #333);
  }

  /* Progress Bar */
  .progress-bar {
    max-width: 800px;
    margin: 0 auto;
    position: relative;
    padding: 0 20px;
  }
  
  .steps {
    display: flex;
    justify-content: space-between;
    position: relative;
    z-index: 1;
  }
  
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  
  .step-number {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: white;
    border: 3px solid var(--border-color, #e0e0e0);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: var(--text-secondary, #666);
    transition: all 0.3s ease;
    font-size: 1.1rem;
  }
  
  .step.active .step-number {
    background: var(--accent, #4f46e5);
    border-color: var(--accent, #4f46e5);
    color: white;
    transform: scale(1.1);
  }
  
  .step.completed .step-number {
    background: #10b981;
    border-color: #10b981;
    color: white;
  }
  
  .step-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-secondary, #666);
  }
  
  .step.active .step-label {
    color: var(--accent, #4f46e5);
    font-weight: 600;
  }
  
  .progress-fill {
    position: absolute;
    top: 24px;
    left: 44px;
    right: 44px;
    height: 4px;
    background: linear-gradient(to right, #10b981, var(--accent, #4f46e5));
    transition: width 0.5s ease;
    z-index: 0;
    border-radius: 2px;
  }
  
  /* Content Area */
  .content {
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
    background: white;
    padding: 2.5rem;
    border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  }

  .step-content h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.75rem;
    color: var(--text-primary, #333);
  }

  .step-content p {
    margin: 0 0 2rem 0;
    color: var(--text-secondary, #666);
    font-size: 1rem;
    line-height: 1.6;
  }

  /* States */
  .loading-state, .error-state {
    text-align: center;
    padding: 3rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid var(--accent, #4f46e5);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .success-message {
    padding: 1rem;
    background: #d1fae5;
    border: 2px solid #10b981;
    border-radius: 8px;
    color: #065f46;
    font-weight: 500;
    margin-bottom: 1rem;
  }

  .error-message {
    padding: 1rem;
    background: #fee2e2;
    border: 2px solid #ef4444;
    border-radius: 8px;
    color: #991b1b;
    margin-bottom: 1rem;
  }

  /* Navigation */
  .navigation {
    display: flex;
    justify-content: space-between;
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid var(--border-color, #e0e0e0);
  }

  button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: var(--accent, #4f46e5);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #4338ca;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
  }

  .btn-secondary {
    background: white;
    color: var(--text-primary, #333);
    border: 2px solid var(--border-color, #e0e0e0);
  }

  .btn-secondary:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #d1d5db;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 1024px) {
    .wizard-grid {
      grid-template-columns: 1fr;
    }
    
    .sidebar {
      order: -1;
    }
  }
</style>