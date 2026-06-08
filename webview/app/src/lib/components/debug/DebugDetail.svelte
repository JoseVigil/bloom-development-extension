<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { FeedEntry } from '../../../routes/debug/types';

  export let entry: FeedEntry | null = null;
  export let filters: Record<string, { on: boolean; count: number; color: string }>;

  const dispatch = createEventDispatcher<{ close: void }>();

  $: open = entry !== null;
  $: catColor = entry ? (filters[entry.category]?.color || 'var(--d-text-secondary)') : '';
</script>

<div class="detail" class:open>
  <div class="detail-header">
    <span class="detail-label">Event detail</span>
    <button class="detail-close" on:click={() => dispatch('close')} aria-label="Close detail">×</button>
  </div>
  <div class="detail-body">
    {#if entry}
      <div class="detail-field">
        <div class="detail-field-key">Category</div>
        <div class="detail-field-val" style="color:{catColor}">{entry.category}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-key">Event</div>
        <div class="detail-field-val">{entry.event}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-key">Level</div>
        <div class="detail-field-val">{entry.level}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-key">Timestamp</div>
        <div class="detail-field-val">{new Date(entry.timestamp).toISOString()}</div>
      </div>
      {#if entry.profile_id}
        <div class="detail-field">
          <div class="detail-field-key">Profile ID</div>
          <div class="detail-field-val">{entry.profile_id}</div>
        </div>
      {/if}
      <div class="detail-field">
        <div class="detail-field-key">Data</div>
        <pre class="detail-json">{JSON.stringify(entry.data, null, 2)}</pre>
      </div>
    {/if}
  </div>
</div>

<style>
  .detail {
    width: 280px;
    border-left: 1px solid var(--d-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
    transform: translateX(100%);
    transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
  }
  .detail.open { transform: translateX(0); }

  .detail-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--d-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .detail-label {
    font-family: var(--d-font-mono);
    font-size: 9px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--d-text-dim);
  }
  .detail-close {
    background: transparent;
    border: none;
    color: var(--d-text-dim);
    cursor: pointer;
    font-family: var(--d-font-mono);
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
    transition: color 0.2s;
  }
  .detail-close:hover { color: var(--d-text-secondary); }

  .detail-body {
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px;
  }
  .detail-field { margin-bottom: 14px; }
  .detail-field-key {
    font-family: var(--d-font-mono);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--d-text-dim);
    margin-bottom: 4px;
  }
  .detail-field-val {
    font-family: var(--d-font-mono);
    font-size: 11px;
    color: var(--d-text-secondary);
    word-break: break-all;
    line-height: 1.6;
  }
  .detail-json {
    font-family: var(--d-font-mono);
    font-size: 11px;
    color: var(--d-text-secondary);
    white-space: pre;
    overflow-x: auto;
    line-height: 1.6;
    background: var(--d-surface);
    border: 1px solid var(--d-border);
    border-radius: 2px;
    padding: 10px 12px;
    margin: 0;
  }
</style>
