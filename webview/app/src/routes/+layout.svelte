<script lang="ts">
  import { onMount } from 'svelte';
  import { theme } from '$lib/stores/theme';
  import SystemStatus from '$lib/components/SystemStatus.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TabBar from '$lib/components/TabBar.svelte';
  import MandateTab from '$lib/components/MandateTab.svelte';
  import LedgerPanel from '$lib/components/LedgerPanel.svelte';
  import { tabsStore, activeTab } from '$lib/stores/tabs';
  import { mandateStore } from '$lib/stores/mandateStore';
  import { FileText, Zap } from 'lucide-svelte';

  // ============================================================================
  // NOTA DE FIX (ver detalle en el PR/commit):
  // Este layout antes dependía de `onboardingStore` / `requiresOnboarding` y
  // forzaba un redirect a `/onboarding` en cada render. Ese store expone
  // `current_step` + `details.*`, pero este layout (y OnboardingWizard.svelte,
  // y routes/onboarding/+page.svelte) leían campos que ya no existen
  // (`step`, `githubAuthenticated`, `geminiConfigured`, etc.) — código huérfano
  // de una versión anterior del contrato.
  //
  // El onboarding real vive en Electron (fuera de este webview), así que esta
  // capa web NO debe gatear ni redirigir en base a estado de onboarding.
  // Se elimina toda esa lógica. El webview siempre asume "ya onboarded" y
  // muestra el sidebar / contenido normal.
  // ============================================================================

  let rightPaneCollapsed = false;
  let isWebview = false;
  let isElectron = false;
  let isChecking = true;

  const showSidebar = true;

  onMount(() => {
    console.log('🎨 [Layout] Mounting...');

    isWebview = typeof window !== 'undefined' && !!(window as any).vscode;
    isElectron = typeof window !== 'undefined' && !!(window as any).api;
    document.documentElement.classList.add('dark');

    console.log('🔍 [Layout] Environment:', { isWebview, isElectron });

    // Ya no hay chequeo de onboarding acá: el webview no gatea navegación
    // por ese estado. Solo un breve loading inicial para evitar flash.
    isChecking = false;

    console.log('✅ [Layout] Ready');
  });

  function toggleRightPane() {
    rightPaneCollapsed = !rightPaneCollapsed;
    console.log('📐 [UI] Right pane collapsed:', rightPaneCollapsed);
  }

  // Consolidación Genesis-como-Mandate (ver MandateTab.svelte): "Nuevo
  // Mandate" abre un tab genérico respaldado por un mandate placeholder de
  // mandateStore.ts (no hay creación real de mandate desde esta UI todavía
  // — ver nota de cabecera de ese store). El tab se marca no-cerrable
  // mientras el mandate esté en status 'building', reusando el mecanismo
  // `closable` que tabsStore ya provee (no se agrega uno nuevo).
  function handleNewMandate() {
    const mandate = mandateStore.createMandate({
      mandateType: 'genesis',
      domainBaseline: 'empty'
    });
    tabsStore.openTab({
      id: mandate.mandateId,
      title: mandate.title,
      mandateId: mandate.mandateId,
      closable: mandate.status !== 'building'
    });
  }

  function handleToggleAlfred() {
    console.log('🤖 [TabBar] togglealfred — panel de Alfred aún no implementado');
  }
</script>

{#if isChecking}
  <div class="loading-screen">
    <div class="spinner"></div>
    <p>Loading Bloom Nucleus...</p>
  </div>
{:else}
  <div class="btip-layout">
    {#if showSidebar}
      <header class="header">
        <div class="header-left">
          <h1 class="title">CAMBIO TEST 123</h1>
        </div>
        <div class="header-center">
          <SystemStatus mode="badge" />
        </div>
        <div class="header-right">
          <button class="action-btn" aria-label="Create Nucleus">
            <Zap size={16} />
            <span>Crear Nucleus</span>
          </button>
          <button class="action-btn" aria-label="Open Explorer">
            <FileText size={16} />
            <span>Explorer</span>
          </button>
        </div>
      </header>

      <div class="main-container">
        <Sidebar />

        <main class="content" role="main">
          <TabBar on:newmandate={handleNewMandate} on:togglealfred={handleToggleAlfred} />
          <div class="content-body">
            {#if $activeTab?.mandateId}
              <MandateTab mandateId={$activeTab.mandateId} />
            {:else}
              <slot />
            {/if}
          </div>
        </main>

        <aside class="right-pane" class:collapsed={rightPaneCollapsed} role="region" aria-label="Side panel">
          <button on:click={toggleRightPane} class="collapse-btn" aria-label="Toggle side panel">
            {rightPaneCollapsed ? '◀' : '▶'}
          </button>
          {#if !rightPaneCollapsed}
            <div class="right-content">
              {#if $activeTab?.mandateId}
                <LedgerPanel mandateId={$activeTab.mandateId} />
              {:else}
                <slot name="right-pane" />
              {/if}
            </div>
          {/if}
        </aside>
      </div>
    {:else}
      <main class="content-full" role="main">
        <slot />
      </main>
    {/if}
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #d4d4d4);
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(.dark) {
    --bg-primary: #1e1e1e;
    --bg-secondary: #252526;
    --bg-tertiary: #2d2d30;
    --text-primary: #d4d4d4;
    --text-secondary: #888;
    --border-color: #333;
    --accent: #007acc;
    --accent-hover: #005a9e;
  }

  .loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: var(--bg-primary, #0f0f0f);
    color: var(--text-primary, #ffffff);
  }

  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid rgba(139, 92, 246, 0.1);
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-screen p {
    font-size: 16px;
    color: var(--text-secondary, #a1a1aa);
  }

  .btip-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .content-full {
    flex: 1;
    overflow: auto;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    height: 48px;
  }

  .header-left, .header-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--accent);
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background 0.2s;
  }

  .action-btn:hover {
    background: var(--accent-hover);
  }

  .main-container {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-primary);
  }

  .content-body {
    flex: 1;
    overflow: auto;
  }

  .right-pane {
    width: 16rem;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
    position: relative;
    transition: width 0.3s;
  }

  .right-pane.collapsed {
    width: 2rem;
  }

  .collapse-btn {
    position: absolute;
    top: 0.5rem;
    left: 0.25rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    z-index: 10;
  }

  .right-content {
    padding: 2.5rem 1rem 1rem;
    height: 100%;
    overflow: auto;
  }

  @media (min-width: 1024px) {
    .header {
      padding: 0.75rem 1.5rem;
    }
  }
</style>
