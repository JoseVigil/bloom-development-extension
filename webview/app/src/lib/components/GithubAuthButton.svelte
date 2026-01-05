<script lang="ts">
  import { onboardingStore } from '$lib/stores/onboarding';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  
  const dispatch = createEventDispatcher();
  
  let loading = false;
  let error = '';
  let success = false;
  let oauthInProgress = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  
  // Listen to WebSocket events for auth updates
  onMount(() => {
    // Check if we're already authenticated
    checkAuthStatus();
    
    // Set up WebSocket listener if available
    if (typeof window !== 'undefined' && (window as any).wsClient) {
      (window as any).wsClient.on('auth:updated', handleAuthUpdate);
      (window as any).wsClient.on('auth:error', handleAuthError);
    }
  });
  
  onDestroy(() => {
    stopPolling();
    if (typeof window !== 'undefined' && (window as any).wsClient) {
      (window as any).wsClient.off('auth:updated', handleAuthUpdate);
      (window as any).wsClient.off('auth:error', handleAuthError);
    }
  });
  
  async function checkAuthStatus() {
    try {
      const response = await fetch('http://localhost:48215/api/v1/auth/github/status');
      if (response.ok) {
        const data = await response.json();
        if (data.data?.authenticated) {
          success = true;
          await onboardingStore.refresh();
        }
      }
    } catch (e) {
      console.error('Error checking auth status:', e);
    }
  }
  
  function handleAuthUpdate(data: any) {
    console.log('Auth update received:', data);
    if (data.githubAuthenticated) {
      success = true;
      oauthInProgress = false;
      loading = false;
      error = '';
      
      // Trigger store refresh
      onboardingStore.refresh();
      
      // Dispatch success event
      dispatch('success', {
        username: data.githubUsername,
        organizations: data.allOrgs
      });
      
      stopPolling();
    }
  }
  
  function handleAuthError(data: any) {
    console.error('Auth error received:', data);
    error = data.message || 'Error durante la autenticación';
    oauthInProgress = false;
    loading = false;
    stopPolling();
  }
  
  function startPolling() {
    // Poll for auth status every 2 seconds while OAuth is in progress
    pollInterval = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:48215/api/v1/auth/github/status');
        if (response.ok) {
          const data = await response.json();
          if (data.data?.authenticated) {
            handleAuthUpdate({
              githubAuthenticated: true,
              githubUsername: data.data.user?.login,
              allOrgs: data.data.organizations?.map((org: any) => org.login) || []
            });
          }
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 2000);
  }
  
  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }
  
  async function handleStartOAuth() {
    loading = true;
    error = '';
    oauthInProgress = true;
    
    try {
      const response = await fetch('http://localhost:48215/api/v1/auth/github/start', {
        method: 'GET'
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start OAuth flow');
      }
      
      const data = await response.json();
      console.log('OAuth flow started:', data);
      
      // Start polling for completion
      startPolling();
      
      loading = false;
      
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error iniciando OAuth';
      console.error('OAuth start error:', e);
      loading = false;
      oauthInProgress = false;
    }
  }
  
  function cancelOAuth() {
    oauthInProgress = false;
    stopPolling();
    error = 'OAuth cancelado';
  }
</script>

<div class="github-auth-container">
  {#if success}
    <!-- Success State -->
    <div class="success-state" transition:slide={{ duration: 300 }}>
      <div class="success-icon">
        <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm3.93 6.07L6.5 11.5l-2.43-2.43 1.43-1.43L6.5 8.64l4-4 1.43 1.43z"/>
        </svg>
      </div>
      <div class="success-content">
        <h4>✅ GitHub Conectado</h4>
        <p>Tu cuenta ha sido vinculada exitosamente</p>
      </div>
    </div>
  {:else if oauthInProgress}
    <!-- OAuth In Progress State -->
    <div class="oauth-progress" transition:slide={{ duration: 300 }}>
      <div class="progress-content">
        <div class="spinner-large"></div>
        <h4>Esperando autorización...</h4>
        <p>Se abrió una ventana de Chrome para que autorices la aplicación</p>
        
        <div class="progress-steps">
          <div class="step">
            <span class="step-number">1</span>
            <span class="step-text">Revisa la ventana de Chrome</span>
          </div>
          <div class="step">
            <span class="step-number">2</span>
            <span class="step-text">Autoriza Bloom Nucleus</span>
          </div>
          <div class="step">
            <span class="step-number">3</span>
            <span class="step-text">Espera la confirmación</span>
          </div>
        </div>
        
        <button
          class="cancel-button"
          on:click={cancelOAuth}
          type="button"
        >
          Cancelar
        </button>
      </div>
    </div>
  {:else}
    <!-- Initial State -->
    <div class="auth-initial" transition:fade={{ duration: 200 }}>
      <div class="auth-header">
        <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" class="github-logo">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <h3>Conectar con GitHub</h3>
        <p>Autoriza Bloom para acceder a tus repositorios y organizaciones</p>
      </div>
      
      <button
        class="github-button"
        on:click={handleStartOAuth}
        disabled={loading}
        type="button"
      >
        {#if loading}
          <span class="spinner"></span>
          Iniciando...
        {:else}
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          Autorizar con GitHub
        {/if}
      </button>
      
      {#if error}
        <div class="error-message" transition:slide={{ duration: 200 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zM7 3h2v6H7V3zm0 8h2v2H7v-2z"/>
          </svg>
          {error}
        </div>
      {/if}
      
      <div class="info-box">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm.5 13H7v-1.5h1.5V13zm1.5-4.5H6c0-3 3-3 3-5.5C9 2 8 1 6.5 1 5 1 4 2 4 3.5h1.5c0-.83.67-1.5 1.5-1.5s1 .67 1 1.5c0 1.5-3 1.75-3 4.5h4.5v1z"/>
        </svg>
        <div class="info-content">
          <strong>¿Qué permisos necesita Bloom?</strong>
          <ul>
            <li><code>repo</code> - Acceso a tus repositorios</li>
            <li><code>read:org</code> - Ver tus organizaciones</li>
            <li><code>read:user</code> - Ver tu perfil público</li>
          </ul>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .github-auth-container {
    display: flex;
    flex-direction: column;
  }
  
  /* Initial State */
  .auth-initial {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .auth-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    text-align: center;
    padding: 1rem 0;
  }
  
  .github-logo {
    color: #24292e;
    opacity: 0.9;
  }
  
  .auth-header h3 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: #111827;
  }
  
  .auth-header p {
    margin: 0;
    font-size: 0.9375rem;
    color: #6b7280;
    max-width: 400px;
  }
  
  .github-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem 2rem;
    background: #24292e;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(36, 41, 46, 0.2);
  }
  
  .github-button:hover:not(:disabled) {
    background: #1b1f23;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(36, 41, 46, 0.3);
  }
  
  .github-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  /* OAuth In Progress State */
  .oauth-progress {
    background: #f9fafb;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    padding: 2rem;
  }
  
  .progress-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    text-align: center;
  }
  
  .spinner-large {
    width: 3rem;
    height: 3rem;
    border: 4px solid #e5e7eb;
    border-top-color: #4f46e5;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  .progress-content h4 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
  }
  
  .progress-content p {
    margin: 0;
    font-size: 0.9375rem;
    color: #6b7280;
    max-width: 400px;
  }
  
  .progress-steps {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    max-width: 350px;
    margin: 1rem 0;
  }
  
  .step {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    text-align: left;
  }
  
  .step-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: #4f46e5;
    color: white;
    border-radius: 50%;
    font-weight: 600;
    font-size: 0.875rem;
    flex-shrink: 0;
  }
  
  .step-text {
    font-size: 0.9375rem;
    color: #374151;
    font-weight: 500;
  }
  
  .cancel-button {
    padding: 0.625rem 1.25rem;
    background: white;
    color: #6b7280;
    border: 2px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .cancel-button:hover {
    background: #f9fafb;
    border-color: #9ca3af;
    color: #374151;
  }
  
  /* Success State */
  .success-state {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
    border: 2px solid #10b981;
    border-radius: 12px;
  }
  
  .success-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    background: white;
    border-radius: 50%;
    color: #10b981;
    flex-shrink: 0;
  }
  
  .success-content h4 {
    margin: 0 0 0.25rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #065f46;
  }
  
  .success-content p {
    margin: 0;
    font-size: 0.9375rem;
    color: #065f46;
    opacity: 0.9;
  }
  
  /* Error Message */
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
  
  .error-message svg {
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
  
  /* Info Box */
  .info-box {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    background: #eff6ff;
    border: 1px solid #dbeafe;
    border-radius: 8px;
  }
  
  .info-box svg {
    flex-shrink: 0;
    color: #3b82f6;
    margin-top: 0.125rem;
  }
  
  .info-content {
    flex: 1;
  }
  
  .info-content strong {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    color: #1e40af;
  }
  
  .info-content ul {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.8125rem;
    color: #1e40af;
    line-height: 1.6;
  }
  
  .info-content code {
    background: #dbeafe;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 0.875em;
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