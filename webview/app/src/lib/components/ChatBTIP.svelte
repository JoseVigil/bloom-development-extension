<script lang="ts">
  import { Send, Paperclip, RotateCcw } from 'lucide-svelte';
  import { intentsStore } from '$lib/stores/intents';
  
  export let turns: any[] = [];
  export let intentId: string;
  
  let message = '';
  let sending = false;
  
  async function sendMessage() {
    if (!message.trim() || sending) return;
    
    sending = true;
    try {
      await intentsStore.addTurn(intentId, {
        actor: 'USER',
        content: message,
        timestamp: new Date().toISOString()
      });
      message = '';
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      sending = false;
    }
  }
  
  function revertTurn(turnId: string) {
    console.log('Revert turn:', turnId);
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="chat-btip">
  <div class="chat-messages">
    {#if turns.length === 0}
      <div class="empty">
        <p>No conversation yet. Start by asking a question or providing context.</p>
      </div>
    {:else}
      {#each turns as turn (turn.id)}
        <div class="message" class:user={turn.actor === 'USER'} class:ai={turn.actor === 'AI'}>
          <div class="message-header">
            <span class="actor">{turn.actor}</span>
            <span class="timestamp">{new Date(turn.timestamp).toLocaleTimeString()}</span>
            {#if turn.tokens}
              <span class="tokens">{turn.tokens} tokens</span>
            {/if}
          </div>
          <div class="message-content">
            {turn.content}
          </div>
          {#if turn.actor === 'AI' && turn.artifacts}
            <div class="artifacts">
              {#each turn.artifacts as artifact}
                <div class="artifact">
                  <span>{artifact.type}: {artifact.name}</span>
                </div>
              {/each}
            </div>
          {/if}
          <div class="message-actions">
            <button on:click={() => revertTurn(turn.id)} class="action-btn" title="Revert turn">
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
  <div class="chat-input">
    <button class="attach-btn" title="Attach files">
      <Paperclip size={18} />
    </button>
    <textarea
      bind:value={message}
      on:keydown={handleKeyDown}
      placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
      rows="3"
    />
    <button on:click={sendMessage} disabled={!message.trim() || sending} class="send-btn">
      <Send size={18} />
    </button>
  </div>
</div>

<style>
  .chat-btip {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 900px;
    margin: 0 auto;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
    text-align: center;
    padding: 2rem;
  }

  .message {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: 8px;
    max-width: 85%;
  }

  .message.user {
    align-self: flex-end;
    background: var(--accent);
    color: white;
  }

  .message.ai {
    align-self: flex-start;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
  }

  .message-header {
    display: flex;
    gap: 0.75rem;
    font-size: 0.75rem;
    opacity: 0.8;
  }

  .actor {
    font-weight: 600;
  }

  .message-content {
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .artifacts {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .artifact {
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    font-size: 0.75rem;
  }

  .message-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .action-btn {
    background: transparent;
    border: none;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
  }

  .action-btn:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.1);
  }

  .chat-input {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
    align-items: flex-end;
  }

  .attach-btn {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    cursor: pointer;
    padding: 0.625rem;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: all 0.2s;
  }

  .attach-btn:hover {
    background: var(--bg-tertiary);
  }

  textarea {
    flex: 1;
    padding: 0.75rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: inherit;
    font-size: 0.875rem;
    resize: none;
  }

  textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  .send-btn {
    background: var(--accent);
    border: none;
    color: white;
    cursor: pointer;
    padding: 0.625rem;
    border-radius: 6px;
    display: flex;
    align-items: center;
    transition: all 0.2s;
  }

  .send-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>