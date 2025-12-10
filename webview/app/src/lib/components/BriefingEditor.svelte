<script lang="ts">
  export let briefing: {
    problem: string;
    expectedOutput: string;
    currentBehavior: string;
    desiredBehavior: string;
    considerations: string;
  };
</script>

<div class="briefing-editor">
  <div class="field field-large">
    <label for="problem">Problem to Solve *</label>
    <textarea
      id="problem"
      bind:value={briefing.problem}
      placeholder="Describe the problem in detail..."
      rows="8"
      required
    />
  </div>

  <div class="field">
    <label for="output">Expected Output *</label>
    <input
      id="output"
      type="text"
      bind:value={briefing.expectedOutput}
      placeholder="What should be produced?"
      required
    />
  </div>

  <div class="field">
    <label for="current">Current Behavior</label>
    <input
      id="current"
      type="text"
      bind:value={briefing.currentBehavior}
      placeholder="How does it work now?"
    />
  </div>

  <div class="field">
    <label for="desired">Desired Behavior *</label>
    <input
      id="desired"
      type="text"
      bind:value={briefing.desiredBehavior}
      placeholder="How should it work?"
      required
    />
  </div>

  <div class="field">
    <label for="considerations">Additional Considerations</label>
    <textarea
      id="considerations"
      bind:value={briefing.considerations}
      placeholder="Any other important details..."
      rows="4"
    />
  </div>
</div>

<style>
  .briefing-editor {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 800px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field-large textarea {
    min-height: 200px;
  }

  label {
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  input, textarea {
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    resize: vertical;
  }

  input:focus, textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  input::placeholder, textarea::placeholder {
    color: var(--text-secondary);
  }
</style>