<script lang="ts">
  import { addGeminiKey, validateGeminiKey } from '$lib/api';
  import { onboardingStore } from '$lib/stores/onboarding';
  import { createEventDispatcher } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  
  const dispatch = createEventDispatcher();
  
  let apiKey = '';
  let profile = 'default';
  let priority = 0;
  let saving = false;
  let testing = false;
  let error = '';
  let success = false;
  let testResult: { valid: boolean; error?: string } | null = null;
  
  // Real-time format validation
  $: keyValid = apiKey.length === 0 || /^AIza[0-9A-Za-z_-]{35}$/.test(apiKey);
  $: showError = apiKey.length > 5 && !keyValid;
  
  async function testApiKey() {
    if (!apiKey.trim() || !keyValid) return;
    
    testing = true;
    error = '';
    testResult = null;
    
    try {
      // First save the key
      await addGeminiKey({
        profile,
        key: apiKey.trim(),
        priority
      });
      
      // Then validate it
      const result = await validateGeminiKey(profile);
      
      testResult = {
        valid: result.data?.valid || false,
        error: result.data?.valid ? undefined : 'La API key no es válida o no tiene los permisos necesarios'
      };
      
      if (!testResult.valid) {
        error = testResult.error || 'Validación fallida';
      }
      
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error al validar la API key';
      testResult = { valid: false, error };
    } finally {
      testing = false;
    }
  }
  
  async function handleSave() {
    if (!apiKey.trim() || !keyValid) return;
    
    saving = true;
    error = '';
    success = false;
    
    try {
      // Save the key
      await addGeminiKey({
        profile,
        key: apiKey.trim(),
        priority
      });
      
      // Validate it
      const result = await validateGeminiKey(profile);
      
      if (!result.data?.valid) {
        throw new Error('La API key se guardó pero no pudo ser validada. Verifica que sea correcta.');
      }
      
      success = true;
      
      // Refresh onboarding status
      await onboardingStore.refresh();
      
      // Dispatch success event
      dispatch('success', { profile, priority });
      
      // Clear form after delay
      setTimeout(() => {
        apiKey = '';
        success = false;
        testResult = null;
      }, 2000);
      
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error al guardar la API key';
      console.error('Gemini key save error:', e);
    } finally {
      saving = false;
    }
  }
  
  function handlePaste(event: ClipboardEvent) {
    const pastedText = event.clipboardData?.getData('text') || '';
    apiKey = pastedText.trim();
  }
</script>

<div class="gemini-form">
  <div class="input-group">
    <label for="gemini-key">
      Google Gemini API Key
      {#if keyValid && apiKey.length > 0}
        <span class="valid-badge" transition:fade>✓ Formato válido</span>
      {/if}
    </label>
    
    <div class="input-wrapper">
      <input
        id="gemini-key"
        type="password"
        bind:value={apiKey}
        on:paste={handlePaste}
        placeholder="AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        disabled={saving || testing}
        class:valid={keyValid && apiKey.length > 0}
        class:invalid={showError}
      />
      
      {#if apiKey.length > 0}
        <button
          class="clear-button"
          on:click={() => { apiKey = ''; error = ''; testResult = null; }}
          type="button"
          aria-label="Limpiar"
          transition:fade
        >
          ×
        </button>
      {/if}
    </div>
    
    {#if showError}
      <div class="validation-error" transition:slide={{ duration: 200 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm4.93 11.07L11.07 12.93 8 9.86l-3.07 3.07-1.86-1.86L6.14 8 3.07 4.93l1.86-1.86L8 6.14l3.07-3.07 1.86 1.86L9.86 8l3.07 3.07z"/>
        </svg>
        Las API keys de Gemini comienzan con "AIza" y tienen 39 caracteres
      </div>
    {/if}
    
    {#if error}
      <div class="error-message" transition:slide={{ duration: 200 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zM7 3h2v6H7V3zm0 8h2v2H7v-2z"/>
        </svg>
        {error}
      </div>
    {/if}
    
    {#if testResult && testResult.valid}
      <div class="success-message" transition:slide={{ duration: 200 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.93 6.07L6.5 11.5l-2.43-2.43 1.43-1.43L6.5 8.64l4-4 1.43 1.43z"/>
        </svg>
        ✓ API key validada correctamente
      </div>
    {/if}
    
    {#if success}
      <div class="success-banner" transition:slide={{ duration: 300 }}>
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.93 6.07L6.5 11.5l-2.43-2.43 1.43-1.43L6.5 8.64l4-4 1.43 1.43z"/>
        </svg>
        <div>
          <strong>¡API Key configurada!</strong>
          <p>Gemini AI está listo para usar</p>
        </div>
      </div>
    {/if}
    
    <div class="advanced-options">
      <details>
        <summary>Opciones avanzadas</summary>
        <div class="advanced-content">
          <div class="field">
            <label for="profile">
              Perfil
              <span class="field-hint">Nombre del perfil de configuración</span>
            </label>
            <input
              id="profile"
              type="text"
              bind:value={profile}
              placeholder="default"
              disabled={saving || testing}
            />
          </div>
          
          <div class="field">
            <label for="priority">
              Prioridad
              <span class="field-hint">Orden de uso (0 = mayor prioridad)</span>
            </label>
            <input
              id="priority"
              type="number"
              bind:value={priority}
              min="0"
              max="10"
              disabled={saving || testing}
            />
          </div>
        </div>
      </details>
    </div>
    
    <div class="helper-links">
      <a 
        href="https://aistudio.google.com/app/apikey" 
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm.5 13H7v-1.5h1.5V13zm1.5-4.5H6c0-3 3-3 3-5.5C9 2 8 1 6.5 1 5 1 4 2 4 3.5h1.5c0-.83.67-1.5 1.5-1.5s1 .67 1 1.5c0 1.5-3 1.75-3 4.5h4.5v1z"/>
        </svg>
        Obtener API key de Google AI Studio
      </a>
      
      <a 
        href="https://ai.google.dev/gemini-api/docs/api-key" 
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8.5 2.687c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 000 2.5v11a.5.5 0 00.707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 00.78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0016 13.5v-11a.5.5 0 00-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/>
        </svg>
        Documentación
      </a>
    </div>
  </div>
  
  <div class="action-buttons">
    <button
      class="test-button"
      on:click={testApiKey}
      disabled={testing || saving || !keyValid || apiKey.length === 0}
      type="button"
    >
      {#if testing}
        <span class="spinner"></span>
        Probando...
      {:else}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm-.5 13H6v-1.5h1.5V13zm3.5-6.5c-.5.5-1 .75-1 1.5v1H8.5V8c0-1.25.75-1.75 1.25-2.25.5-.5.75-.75.75-1.25 0-.83-.67-1.5-1.5-1.5S7.5 3.67 7.5 4.5H6c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1-.5 1.5-1 2z"/>
        </svg>
        Probar conexión
      {/if}
    </button>
    
    <button
      class="save-button"
      on:click={handleSave}
      disabled={saving || testing || !keyValid || apiKey.length === 0}
      type="button"
    >
      {#if saving}
        <span class="spinner"></span>
        Guardando...
      {:else}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
        </svg>
        Guardar y continuar
      {/if}
    </button>
  </div>
</div>

<style>
  .gemini-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    background: #f9fafb;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    padding: 1.5rem;
  }
  
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    font-size: 0.9375rem;
    color: #374151;
  }
  
  .valid-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    background: #d1fae5;
    color: #065f46;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }
  
  input[type="password"],
  input[type="text"],
  input[type="number"] {
    flex: 1;
    padding: 0.75rem;
    border: 2px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.9375rem;
    transition: all 0.2s ease;
    background: white;
  }
  
  input[type="password"] {
    padding-right: 2.5rem;
    font-family: 'Courier New', monospace;
  }
  
  input:focus {
    outline: none;
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }
  
  input.valid {
    border-color: #10b981;
  }
  
  input.invalid {
    border-color: #ef4444;
  }
  
  input:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }
  
  .clear-button {
    position: absolute;
    right: 0.5rem;
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e5e7eb;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1.25rem;
    line-height: 1;
    color: #6b7280;
    transition: all 0.15s ease;
  }
  
  .clear-button:hover {
    background: #d1d5db;
    color: #374151;
  }
  
  .validation-error,
  .error-message {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #fee2e2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #991b1b;
    font-size: 0.875rem;
    line-height: 1.5;
  }
  
  .validation-error svg,
  .error-message svg {
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
  
  .success-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #d1fae5;
    border: 1px solid #a7f3d0;
    border-radius: 6px;
    color: #065f46;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .success-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
    border: 2px solid #10b981;
    border-radius: 8px;
    color: #065f46;
  }
  
  .success-banner svg {
    flex-shrink: 0;
  }
  
  .success-banner strong {
    display: block;
    font-size: 0.9375rem;
    margin-bottom: 0.25rem;
  }
  
  .success-banner p {
    margin: 0;
    font-size: 0.875rem;
    opacity: 0.9;
  }
  
  .advanced-options {
    margin-top: 0.5rem;
  }
  
  .advanced-options details {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
  }
  
  .advanced-options summary {
    padding: 0.75rem 1rem;
    cursor: pointer;
    user-select: none;
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
    transition: background 0.15s ease;
  }
  
  .advanced-options summary:hover {
    background: #f9fafb;
  }
  
  .advanced-content {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border-top: 1px solid #e5e7eb;
  }
  
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .field label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #4b5563;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .field-hint {
    font-size: 0.75rem;
    font-weight: 400;
    color: #9ca3af;
  }
  
  .field input {
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
  }
  
  .helper-links {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.875rem;
  }
  
  .helper-links a {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: #4f46e5;
    text-decoration: none;
    transition: color 0.15s ease;
  }
  
  .helper-links a:hover {
    color: #4338ca;
    text-decoration: underline;
  }
  
  .action-buttons {
    display: flex;
    gap: 0.75rem;
  }
  
  .test-button,
  .save-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 140px;
  }
  
  .test-button {
    background: white;
    color: #374151;
    border: 2px solid #d1d5db;
  }
  
  .test-button:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #9ca3af;
  }
  
  .save-button {
    flex: 1;
    background: #4f46e5;
    color: white;
  }
  
  .save-button:hover:not(:disabled) {
    background: #4338ca;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(79, 70, 229, 0.3);
  }
  
  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>