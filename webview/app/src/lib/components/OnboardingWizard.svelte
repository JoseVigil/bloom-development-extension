<script lang="ts">
  import { fly } from 'svelte/transition';
  import CopilotChat from '$lib/components/CopilotChat.svelte'; // Added

  export let step: 'welcome' | 'gemini' | 'nucleus' | 'projects';

  const steps = [
    { id: 'welcome', label: 'GitHub', number: 1 },
    { id: 'gemini', label: 'Gemini', number: 2 },
    { id: 'nucleus', label: 'Nucleus', number: 3 },
    { id: 'projects', label: 'Proyectos', number: 4 }
  ];

  $: currentIndex = steps.findIndex(s => s.id === step);
</script>

<div class="wizard-grid"> <!-- Changed to grid for sidebar -->
  <div class="main">
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
    
    <div class="content" in:fly={{ y: 20, duration: 300 }}>
      <slot />
    </div>
  </div>

  <div class="sidebar"> <!-- Added sidebar -->
    <h3>Copilot Assistant</h3>
    <CopilotChat />
  </div>
</div>

<style>
  .wizard-grid {
    display: grid;
    grid-template-columns: 1fr 300px; /* Main + Sidebar */
    min-height: 100vh;
    padding: 2rem;
    gap: 2rem;
    background: var(--bg-primary);
  }

  .main {
    /* No additional styles needed beyond layout */
  }

  .sidebar {
    background: var(--bg-secondary);
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid var(--border-color);
  }

  h3 {
    margin-bottom: 1rem;
  }

  .progress-bar {
    max-width: 800px;
    margin: 0 auto 3rem;
    position: relative;
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
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--bg-secondary);
    border: 2px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    color: var(--text-secondary);
    transition: all 0.3s;
  }
  
  .step.active .step-number {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }
  
  .step.completed .step-number {
    background: #10b981;
    border-color: #10b981;
    color: white;
  }
  
  .step-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  
  .progress-fill {
    position: absolute;
    top: 20px;
    left: 0;
    height: 4px;
    background: var(--accent);
    transition: width 0.3s;
    z-index: 0;
  }
  
  .content {
    max-width: 800px;
    margin: 0 auto;
  }
</style>