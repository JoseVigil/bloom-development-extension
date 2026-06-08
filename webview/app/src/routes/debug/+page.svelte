<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { websocketStore } from '$lib/stores/websocket';
  import DebugSidebar from '$lib/components/debug/DebugSidebar.svelte';
  import DebugFeed from '$lib/components/debug/DebugFeed.svelte';
  import DebugDetail from '$lib/components/debug/DebugDetail.svelte';
  import DebugSimBar from '$lib/components/debug/DebugSimBar.svelte';
  import type { FeedEntry } from './types';

  // ── CONFIG ──────────────────────────────────────────────────────────────────
  const API_URL = 'http://localhost:48215';
  const MAX_ENTRIES = 500;

  // ── STATE ────────────────────────────────────────────────────────────────────
  let entries: FeedEntry[] = [];
  let paused = false;
  let selectedEntry: FeedEntry | null = null;
  let healthData: { state?: string; components?: Record<string, any> } | null = null;
  let healthError = false;
  let healthInterval: ReturnType<typeof setInterval> | null = null;

  let filters: Record<string, { on: boolean; count: number; color: string }> = {
    synapse:  { on: true, count: 0, color: '#378ADD' },
    brain:    { on: true, count: 0, color: '#4ADE80' },
    sentinel: { on: true, count: 0, color: '#F0A040' },
    nucleus:  { on: true, count: 0, color: '#E8EAF0' },
    temporal: { on: true, count: 0, color: '#7F77DD' },
    health:   { on: true, count: 0, color: '#888780' },
  };

  const EVENT_LEVELS: Record<string, FeedEntry['level']> = {
    DISCOVERY_COMPLETE:      'success',
    GITHUB_TOKEN_STORED:     'success',
    PROFILE_LAUNCHED:        'success',
    HANDSHAKE_CONFIRMED:     'success',
    EXTENSION_LOADED:        'success',
    BOOTSTRAP_READY:         'success',
    INTENT_COMPLETED:        'success',
    WORKFLOW_STATE_CHANGED:  'info',
    GITHUB_PAT_DETECTED:     'info',
    COMPONENT_STATE_CHANGED: 'warn',
    INTENT_FAILED:           'error',
  };

  // ── WS STATE ─────────────────────────────────────────────────────────────────
  $: wsConnected = $websocketStore.connected;
  $: wsReconnecting = $websocketStore.reconnecting;
  $: wsStatus = wsConnected ? 'live' : wsReconnecting ? 'reconnecting' : 'connecting';

  // ── LOGIC ────────────────────────────────────────────────────────────────────
  function levelFor(event: string, data: Record<string, any>): FeedEntry['level'] {
    if (EVENT_LEVELS[event]) return EVENT_LEVELS[event];
    if (data?.error || data?.state === 'FAILED') return 'error';
    return 'info';
  }

  function ingestEvent(payload: any) {
    if (paused) return;
    const entry: FeedEntry = {
      id:         `${Date.now()}-${Math.random()}`,
      category:   payload.category || 'nucleus',
      event:      payload.event || '?',
      data:       payload.data || {},
      profile_id: payload.profile_id || null,
      timestamp:  payload.timestamp || Date.now(),
      level:      levelFor(payload.event, payload.data || {}),
    };

    entries = [entry, ...entries].slice(0, MAX_ENTRIES);

    if (filters[entry.category] !== undefined) {
      filters[entry.category].count++;
      filters = { ...filters }; // trigger reactivity
    }
  }

  function toggleFilter(cat: string) {
    filters[cat].on = !filters[cat].on;
    filters = { ...filters };
  }

  function clearFeed() {
    entries = [];
    Object.values(filters).forEach(f => (f.count = 0));
    filters = { ...filters };
    selectedEntry = null;
  }

  function togglePause() {
    paused = !paused;
  }

  // ── HEALTH ────────────────────────────────────────────────────────────────────
  async function refreshHealth() {
    try {
      const res = await fetch(API_URL + '/api/health');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      healthData = await res.json();
      healthError = false;
    } catch (_) {
      healthData = null;
      healthError = true;
    }
  }

  // ── LIFECYCLE ─────────────────────────────────────────────────────────────────
  onMount(() => {
    // Connect — safe to call even if already connected; store is shared
    websocketStore.connect('ws://localhost:4124');

    // Subscribe to system_event messages
    // websocketStore.on() registers a callback and does not return an unsubscribe fn
    // because the store's event map is module-level. We register once and ignore
    // duplicates — the callback is keyed by identity inside the map.
    websocketStore.on('system_event', (payload: any) => {
      ingestEvent(payload);
    });

    // Health polling
    refreshHealth();
    healthInterval = setInterval(refreshHealth, 10000);
  });

  onDestroy(() => {
    // Do NOT disconnect the WebSocket — it is shared with the rest of Workspace.
    // Only stop our own polling.
    if (healthInterval) {
      clearInterval(healthInterval);
      healthInterval = null;
    }
  });
</script>

<div class="debug-root">
  <!-- Page header (replaces the Electron titlebar from debug.html) -->
  <div class="debug-header">
    <span class="header-logo">Bloom</span>
    <div class="header-sep"></div>
    <span class="header-title">Debug</span>
    <div class="ws-indicator">
      <div class="ws-dot" class:live={wsStatus === 'live'} class:error={wsStatus === 'reconnecting'}></div>
      <span class="ws-label" class:live={wsStatus === 'live'}>
        {wsStatus}
      </span>
    </div>
  </div>

  <!-- Main layout -->
  <div class="debug-layout">
    <DebugSidebar
      {filters}
      {healthData}
      {healthError}
      on:toggleFilter={(e) => toggleFilter(e.detail)}
      on:clear={clearFeed}
      on:refreshHealth={refreshHealth}
    />

    <div class="main-panel">
      <DebugFeed
        {entries}
        {filters}
        {paused}
        on:selectEntry={(e) => (selectedEntry = e.detail)}
        on:togglePause={togglePause}
      />
      <DebugSimBar on:event={(e) => ingestEvent(e.detail)} />
    </div>

    <DebugDetail
      entry={selectedEntry}
      {filters}
      on:close={() => (selectedEntry = null)}
    />
  </div>
</div>

<style>
  /* ── DEBUG CSS VARIABLES — scoped to .debug-root, not :root ─────────────── */
  .debug-root {
    --d-bg:             #080A0E;
    --d-surface:        #0D1117;
    --d-surface-hover:  #131820;
    --d-border:         rgba(255,255,255,0.06);
    --d-border-active:  rgba(255,255,255,0.18);
    --d-text-primary:   #E8EAF0;
    --d-text-secondary: rgba(232,234,240,0.55);
    --d-text-dim:       rgba(232,234,240,0.25);
    --d-accent:         #C8F55A;
    --d-accent-dim:     rgba(200,245,90,0.10);
    --d-error:          #FF5555;
    --d-warn:           #F0A040;
    --d-success:        #4ADE80;
    --d-font-head:      'Syne', sans-serif;
    --d-font-mono:      'DM Mono', monospace;

    width: 100%;
    height: 100%;
    background: var(--d-bg);
    color: var(--d-text-primary);
    font-family: var(--d-font-head);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  /* Noise grain overlay */
  .debug-root::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 1000;
  }

  /* Header */
  .debug-header {
    height: 40px;
    background: var(--d-surface);
    border-bottom: 1px solid var(--d-border);
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 16px;
    flex-shrink: 0;
    user-select: none;
  }
  .header-logo {
    font-family: var(--d-font-mono);
    font-size: 10px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--d-text-dim);
  }
  .header-sep {
    width: 1px; height: 14px;
    background: var(--d-border);
  }
  .header-title {
    font-family: var(--d-font-mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--d-text-secondary);
  }
  .ws-indicator {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .ws-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--d-text-dim);
    transition: background 0.4s, box-shadow 0.4s;
  }
  .ws-dot.live  { background: var(--d-accent); box-shadow: 0 0 8px var(--d-accent); }
  .ws-dot.error { background: var(--d-error); }
  .ws-label {
    font-family: var(--d-font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--d-text-dim);
    transition: color 0.4s;
  }
  .ws-label.live { color: var(--d-text-secondary); }

  /* Layout */
  .debug-layout {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .main-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
