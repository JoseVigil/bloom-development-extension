<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FeedEntry } from '../../../routes/debug/types';

  export let entries: FeedEntry[] = [];
  export let filters: Record<string, { on: boolean; count: number; color: string }>;
  export let paused = false;

  const dispatch = createEventDispatcher<{
    selectEntry: FeedEntry;
    togglePause: void;
  }>();

  $: filtered = entries.filter(e => filters[e.category]?.on);
  $: eventCountText = filtered.length + (filtered.length !== entries.length ? `/${entries.length}` : '') + ' events';

  function fmtTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('es-AR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
    });
  }

  function dataStr(data: Record<string, any>): string {
    return Object.keys(data).length ? JSON.stringify(data) : '';
  }
</script>

<div class="feed-panel">
  <div class="feed-header">
    <span class="feed-title">Event feed</span>
    <span class="event-count">{eventCountText}</span>
    <button class="pause-btn" class:paused on:click={() => dispatch('togglePause')}>
      {paused ? 'Resume' : 'Pause'}
    </button>
  </div>

  <div class="feed" role="log" aria-live="polite">
    {#if filtered.length === 0}
      <div class="feed-empty">
        {entries.length ? 'All categories filtered out' : 'Waiting for events…'}
      </div>
    {:else}
      {#each filtered as entry (entry.id)}
        <div
          class="entry {entry.level}"
          on:click={() => dispatch('selectEntry', entry)}
          role="button"
          tabindex="0"
          on:keydown={(e) => e.key === 'Enter' && dispatch('selectEntry', entry)}
        >
          <div class="e-time">{fmtTime(entry.timestamp)}</div>
          <div class="e-cat" style="color:{filters[entry.category]?.color || 'var(--d-text-secondary)'}">[{entry.category}]</div>
          <div class="e-event">{entry.event}</div>
          {#if entry.profile_id}
            <div class="e-pid">{entry.profile_id.slice(0, 8)}</div>
          {/if}
          <div class="e-data">{dataStr(entry.data)}</div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .feed-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .feed-header {
    padding: 10px 18px;
    border-bottom: 1px solid var(--d-border);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .feed-title {
    font-family: var(--d-font-mono);
    font-size: 9px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--d-text-dim);
  }
  .event-count {
    font-family: var(--d-font-mono);
    font-size: 10px;
    color: var(--d-text-dim);
    margin-left: auto;
  }
  .pause-btn {
    background: transparent;
    border: 1px solid var(--d-border);
    border-radius: 2px;
    padding: 4px 10px;
    font-family: var(--d-font-mono);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--d-text-dim);
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .pause-btn:hover { border-color: var(--d-border-active); color: var(--d-text-secondary); }
  .pause-btn.paused { border-color: var(--d-warn); color: var(--d-warn); }

  .feed {
    flex: 1;
    overflow-y: auto;
    font-family: var(--d-font-mono);
    font-size: 11px;
    padding: 4px 0;
  }
  .feed::-webkit-scrollbar { width: 3px; }
  .feed::-webkit-scrollbar-track { background: transparent; }
  .feed::-webkit-scrollbar-thumb { background: var(--d-border-active); border-radius: 2px; }

  .feed-empty {
    padding: 60px 24px;
    text-align: center;
    color: var(--d-text-dim);
    font-family: var(--d-font-mono);
    font-size: 12px;
    letter-spacing: 0.08em;
  }

  .entry {
    display: flex;
    gap: 0;
    padding: 0;
    border-left: 2px solid transparent;
    transition: background 0.1s;
    cursor: default;
    animation: entry-in 0.12s ease both;
  }
  .entry:hover { background: var(--d-surface); }
  .entry.success { border-left-color: var(--d-success); }
  .entry.error   { border-left-color: var(--d-error); }
  .entry.warn    { border-left-color: var(--d-warn); }

  .e-time {
    color: var(--d-text-dim);
    padding: 3px 10px 3px 8px;
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.04em;
    font-size: 10px;
    line-height: 1.8;
  }
  .e-cat {
    padding: 3px 8px 3px 0;
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: 400;
    line-height: 1.8;
    font-size: 11px;
  }
  .e-event {
    color: var(--d-text-primary);
    padding: 3px 8px 3px 0;
    flex-shrink: 0;
    line-height: 1.8;
  }
  .e-pid {
    color: var(--d-text-dim);
    font-size: 10px;
    padding: 3px 8px 3px 0;
    flex-shrink: 0;
    line-height: 1.8;
  }
  .e-data {
    color: var(--d-text-secondary);
    padding: 3px 16px 3px 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    line-height: 1.8;
  }

  @keyframes entry-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
