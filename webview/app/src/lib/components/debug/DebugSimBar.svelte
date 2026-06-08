<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ event: any }>();

  const API_URL = 'http://localhost:48215';

  const AUTO_EVENTS = [
    { category: 'temporal', event: 'WORKFLOW_STATE_CHANGED', data: { from: 'PENDING', to: 'RUNNING' }, profile_id: '2183af25' },
    { category: 'synapse',  event: 'GITHUB_PAT_DETECTED',   data: { token_fingerprint: 'ghp_...abc' }, profile_id: '2183af25' },
    { category: 'synapse',  event: 'GITHUB_TOKEN_STORED',   data: { vault_key: 'sk_bloom_pat' },        profile_id: '2183af25' },
    { category: 'brain',    event: 'PROFILE_LAUNCHED',      data: { chrome_pid: 14392, debug_port: 9222 }, profile_id: '2183af25' },
    { category: 'sentinel', event: 'EXTENSION_LOADED',      data: { manifest_version: 3 },              profile_id: '2183af25' },
    { category: 'synapse',  event: 'DISCOVERY_COMPLETE',    data: { steps_done: 5 },                    profile_id: '2183af25' },
    { category: 'temporal', event: 'INTENT_COMPLETED',      data: { intent: 'navigate_to_pr' },         profile_id: '2183af25' },
    { category: 'nucleus',  event: 'BOOTSTRAP_READY',       data: { ws_port: 4124, api_port: 48215 },   profile_id: null },
  ];

  const SIM_OPTIONS = [
    { group: 'synapse',  label: 'GITHUB_PAT_DETECTED',     payload: { category: 'synapse',  event: 'GITHUB_PAT_DETECTED',     data: { token_fingerprint: 'ghp_...abc' }, profile_id: '2183af25' } },
    { group: 'synapse',  label: 'GITHUB_TOKEN_STORED',     payload: { category: 'synapse',  event: 'GITHUB_TOKEN_STORED',     data: { vault_key: 'sk_bloom_pat' },        profile_id: '2183af25' } },
    { group: 'synapse',  label: 'DISCOVERY_COMPLETE',      payload: { category: 'synapse',  event: 'DISCOVERY_COMPLETE',      data: { steps_done: 5 },                    profile_id: '2183af25' } },
    { group: 'synapse',  label: 'HANDSHAKE_CONFIRMED',     payload: { category: 'synapse',  event: 'HANDSHAKE_CONFIRMED',     data: { extension_id: 'bloom-ext' },        profile_id: '2183af25' } },
    { group: 'temporal', label: 'WORKFLOW_STATE_CHANGED',  payload: { category: 'temporal', event: 'WORKFLOW_STATE_CHANGED',  data: { from: 'PENDING', to: 'RUNNING' },   profile_id: '2183af25' } },
    { group: 'temporal', label: 'INTENT_COMPLETED',        payload: { category: 'temporal', event: 'INTENT_COMPLETED',        data: { intent: 'navigate_to_pr' },         profile_id: '2183af25' } },
    { group: 'temporal', label: 'INTENT_FAILED',           payload: { category: 'temporal', event: 'INTENT_FAILED',           data: { intent: 'click_merge', error: 'element_not_found' }, profile_id: '2183af25' } },
    { group: 'brain',    label: 'PROFILE_LAUNCHED',        payload: { category: 'brain',    event: 'PROFILE_LAUNCHED',        data: { chrome_pid: 14392, debug_port: 9222 }, profile_id: '2183af25' } },
    { group: 'health',   label: 'COMPONENT_STATE_CHANGED', payload: { category: 'health',   event: 'COMPONENT_STATE_CHANGED', data: { component: 'brain_service', state: 'UNREACHABLE' }, profile_id: null } },
    { group: 'nucleus',  label: 'BOOTSTRAP_READY',         payload: { category: 'nucleus',  event: 'BOOTSTRAP_READY',         data: { ws_port: 4124, api_port: 48215 },   profile_id: null } },
    { group: 'sentinel', label: 'EXTENSION_LOADED',        payload: { category: 'sentinel', event: 'EXTENSION_LOADED',        data: { manifest_version: 3 },              profile_id: '2183af25' } },
  ];

  const groups = [...new Set(SIM_OPTIONS.map(o => o.group))];

  let selectedIndex = 0;
  let autoInterval: ReturnType<typeof setInterval> | null = null;
  let autoIdx = 0;

  $: autoRunning = autoInterval !== null;

  async function fireSimEvent() {
    const payload = SIM_OPTIONS[selectedIndex].payload;
    let serverReceived = false;
    try {
      const res = await fetch(API_URL + '/api/internal/system-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) serverReceived = true;
    } catch (_) {}

    // Fallback local — if the endpoint is not yet wired
    if (!serverReceived) {
      dispatch('event', { ...payload, timestamp: Date.now() });
    }
    // If serverReceived=true, the event arrives via WS — do not emit locally
  }

  function toggleAuto() {
    if (autoInterval) {
      clearInterval(autoInterval);
      autoInterval = null;
    } else {
      autoInterval = setInterval(() => {
        const ev = AUTO_EVENTS[autoIdx % AUTO_EVENTS.length];
        dispatch('event', { ...ev, timestamp: Date.now() });
        autoIdx++;
      }, 1000);
    }
  }
</script>

<div class="sim-bar">
  <span class="sim-label">Simulate →</span>
  <select class="sim-select" bind:value={selectedIndex}>
    {#each groups as group}
      <optgroup label={group}>
        {#each SIM_OPTIONS as opt, i}
          {#if opt.group === group}
            <option value={i}>{group} · {opt.label}</option>
          {/if}
        {/each}
      </optgroup>
    {/each}
  </select>
  <button class="sim-fire" on:click={fireSimEvent}>POST →</button>
  <button class="sim-auto" class:running={autoRunning} on:click={toggleAuto}>
    {autoRunning ? 'Auto on' : 'Auto'}
  </button>
</div>

<style>
  .sim-bar {
    background: var(--d-surface);
    border-top: 1px solid var(--d-border);
    padding: 8px 18px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .sim-label {
    font-family: var(--d-font-mono);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--d-text-dim);
    white-space: nowrap;
  }
  .sim-select {
    flex: 1;
    background: var(--d-bg);
    color: var(--d-text-secondary);
    border: 1px solid var(--d-border);
    border-radius: 2px;
    padding: 5px 8px;
    font-family: var(--d-font-mono);
    font-size: 11px;
    outline: none;
    min-width: 0;
  }
  .sim-select:focus { border-color: var(--d-border-active); }
  .sim-fire {
    background: var(--d-accent-dim);
    border: 1px solid rgba(200,245,90,0.3);
    border-radius: 2px;
    padding: 5px 14px;
    font-family: var(--d-font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--d-accent);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.2s, border-color 0.2s;
  }
  .sim-fire:hover { background: rgba(200,245,90,0.18); border-color: var(--d-accent); }
  .sim-auto {
    background: transparent;
    border: 1px solid var(--d-border);
    border-radius: 2px;
    padding: 5px 10px;
    font-family: var(--d-font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--d-text-dim);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
  }
  .sim-auto.running {
    border-color: rgba(200,245,90,0.3);
    color: var(--d-accent);
  }
</style>
