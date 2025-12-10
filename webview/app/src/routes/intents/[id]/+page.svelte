<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { intentsStore } from '$lib/stores/intents';
  import BriefingEditor from '$lib/components/BriefingEditor.svelte';
  import ChatBTIP from '$lib/components/ChatBTIP.svelte';
  import TokenEstimator from '$lib/components/TokenEstimator.svelte';
  import { Play, Save, ArrowLeft } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  
  $: intentId = $page.params.id;
  $: currentIntent = $intentsStore.current;
  $: wizardState = $intentsStore.wizardState;
  
  let activeTab: 'briefing' | 'questions' | 'refinement' = 'briefing';
  let executing = false;
  
  onMount(async () => {
    if (intentId === 'new') {
      intentsStore.createNew();
    } else {
      await intentsStore.loadIntent(intentId);
    }
  });
  
  function canProgress() {
    if (!currentIntent) return false;
    if (wizardState === 'briefing') {
      return currentIntent.briefing.problem.length > 0;
    }
    if (wizardState === 'questions') {
      const filled = currentIntent.questions.filter(q => q.answer.length > 0).length;
      return filled >= 3;
    }
    return true;
  }
  
  async function nextStep() {
    if (wizardState === 'briefing' && canProgress()) {
      intentsStore.setWizardState('questions');
      activeTab = 'questions';
    } else if (wizardState === 'questions' && canProgress()) {
      intentsStore.setWizardState('refinement');
      activeTab = 'refinement';
    }
  }
  
  async function runExecution() {
    if (!currentIntent) return;
    executing = true;
    try {
      await intentsStore.execute(currentIntent.id);
      intentsStore.setWizardState('refinement');
      activeTab = 'refinement';
    } catch (error) {
      console.error('Execution failed:', error);
    } finally {
      executing = false;
    }
  }
  
  async function acceptFinalize() {
    if (!currentIntent) return;
    await intentsStore.finalize(currentIntent.id);
    goto('/intents');
  }
</script>

<div class="intent-editor">
  <header class="editor-header">
    <div class="header-left">
      <button on:click={() => goto('/intents')} class="back-btn" aria-label="Back to intents">
        <ArrowLeft size={20} />
      </button>
      {#if currentIntent}
        <input
          type="text"
          bind:value={currentIntent.title}
          class="title-input"
          placeholder="Intent title"
        />
      {/if}
    </div>
    <div class="header-right">
      <button class="btn-secondary" aria-label="Save draft">
        <Save size={16} />
        Save Draft
      </button>
      <button
        on:click={runExecution}
        disabled={executing || !canProgress()}
        class="btn-primary"
        aria-label="Run execution"
      >
        <Play size={16} />
        {executing ? 'Running...' : 'Run Execution'}
      </button>
    </div>
  </header>

  {#if currentIntent}
    <div class="editor-meta">
      <span>Profile: {currentIntent.profile}</span>
      <span>•</span>
      <span>Project: {currentIntent.project || 'None'}</span>
      {#if currentIntent.derivedFrom}
        <span>•</span>
        <span>Derived from: {currentIntent.derivedFrom}</span>
      {/if}
    </div>

    <div class="editor-body">
      <div class="editor-main">
        <div class="tabs">
          <button
            class="tab"
            class:active={activeTab === 'briefing'}
            on:click={() => activeTab = 'briefing'}
            disabled={wizardState !== 'briefing' && wizardState !== 'questions' && wizardState !== 'refinement'}
          >
            Briefing
          </button>
          <button
            class="tab"
            class:active={activeTab === 'questions'}
            on:click={() => activeTab = 'questions'}
            disabled={wizardState === 'briefing'}
          >
            Questions
            {#if currentIntent.questions.some(q => q.answer)}
              <span class="tab-badge">{currentIntent.questions.filter(q => q.answer).length}/5</span>
            {/if}
          </button>
          <button
            class="tab"
            class:active={activeTab === 'refinement'}
            on:click={() => activeTab = 'refinement'}
            disabled={wizardState !== 'refinement'}
          >
            Refinement
            {#if currentIntent.turns && currentIntent.turns.length > 0}
              <span class="tab-badge">{currentIntent.turns.length}</span>
            {/if}
          </button>
        </div>

        <div class="tab-content">
          {#if activeTab === 'briefing'}
            <BriefingEditor bind:briefing={currentIntent.briefing} />
            {#if canProgress()}
              <div class="step-actions">
                <button on:click={nextStep} class="btn-primary">Next: Questions</button>
              </div>
            {/if}
          {:else if activeTab === 'questions'}
            <div class="questions">
              {#each currentIntent.questions as question, i}
                <div class="question-item">
                  <label>{question.label}</label>
                  <textarea
                    bind:value={question.answer}
                    placeholder="Your answer..."
                    rows="3"
                  />
                </div>
              {/each}
            </div>
            {#if canProgress()}
              <div class="step-actions">
                <button on:click={nextStep} class="btn-primary">Next: Refinement</button>
              </div>
            {/if}
          {:else if activeTab === 'refinement'}
            <ChatBTIP turns={currentIntent.turns || []} intentId={currentIntent.id} />
          {/if}
        </div>
      </div>

      <aside class="editor-sidebar">
        <TokenEstimator content={JSON.stringify(currentIntent.briefing)} />
        
        <div class="sidebar-section">
          <h3>Actions</h3>
          <button on:click={acceptFinalize} class="btn-success">
            Accept & Finalize
          </button>
        </div>
      </aside>
    </div>
  {/if}
</div>

<style>
  .intent-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
  }

  .back-btn {
    background: transparent;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
  }

  .back-btn:hover {
    background: var(--bg-tertiary);
  }

  .title-input {
    font-size: 1.25rem;
    font-weight: 600;
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-primary);
    padding: 0.5rem;
    border-radius: 4px;
    flex: 1;
  }

  .title-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .header-right {
    display: flex;
    gap: 0.75rem;
  }

  .btn-primary, .btn-secondary, .btn-success {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
  }

  .btn-success {
    background: #10b981;
    color: white;
    width: 100%;
    justify-content: center;
  }

  .editor-meta {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .editor-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .editor-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0 1.5rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
  }

  .tab:hover:not(:disabled) {
    color: var(--text-primary);
  }

  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .tab:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tab-badge {
    padding: 0.125rem 0.375rem;
    background: var(--accent);
    color: white;
    border-radius: 10px;
    font-size: 0.75rem;
  }

  .tab-content {
    flex: 1;
    overflow: auto;
    padding: 1.5rem;
  }

  .questions {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 800px;
  }

  .question-item label {
    display: block;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .question-item textarea {
    width: 100%;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: inherit;
    font-size: 0.875rem;
    resize: vertical;
  }

  .question-item textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  .step-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 2rem;
  }

  .editor-sidebar {
    width: 20rem;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
    padding: 1.5rem;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .sidebar-section h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 600;
  }
</style>