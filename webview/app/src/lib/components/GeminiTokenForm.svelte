<script lang="ts">
  import { addGeminiKey } from '../api';  // ← CAMBIO AQUÍ
  import { geminiToken } from '../stores/auth';
  
  let token = '';
  let saving = false;
  let message = '';
  
  async function handleSave() {
    if (!token.trim()) return;
    
    saving = true;
    message = '';
    
    try {
      // ← CAMBIO AQUÍ: usar addGeminiKey con los parámetros correctos
      await addGeminiKey({
        profile: 'default',
        key: token.trim(),
        priority: 0
      });
      geminiToken.set(token);
      message = 'Token guardado correctamente';
    } catch (error) {
      message = 'Error al guardar el token';
    } finally {
      saving = false;
    }
  }
</script>

<div class="form">
  <h3>Token de Gemini</h3>
  <input 
    type="text" 
    bind:value={token} 
    placeholder="Ingresa tu token de Gemini"
    disabled={saving}
  />
  <button on:click={handleSave} disabled={saving || !token.trim()}>
    {saving ? 'Guardando...' : 'Guardar'}
  </button>
  {#if message}
    <p class="message">{message}</p>
  {/if}
</div>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
  }
  
  h3 {
    margin: 0;
    font-size: 18px;
  }
  
  input {
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
  }
  
  button {
    padding: 10px;
    background: #0066cc;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  
  .message {
    margin: 0;
    color: #28a745;
    font-size: 14px;
  }
</style>