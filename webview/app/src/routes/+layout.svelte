<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { theme } from '$lib/stores/theme';
  import { onboardingStore, requiresOnboarding } from '$lib/stores/onboarding';
  import SystemStatus from '$lib/components/SystemStatus.svelte';
  import { Menu, X, Home, FileText, Zap, GitBranch, User, Settings } from 'lucide-svelte';
  
  let sidebarCollapsed = false;
  let rightPaneCollapsed = false;
  let isWebview = false;
  let isChecking = true;
  let isElectron = false;
  
  $: showSidebar = $onboardingStore.step !== 'welcome' && $onboardingStore.completed;
  
  onMount(async () => {
    isWebview = typeof window !== 'undefined' && !!(window as any).vscode;
    isElectron = typeof window !== 'undefined' && !!(window as any).api;
    document.documentElement.classList.add('dark');
    
    // Initialize onboarding state
    await onboardingStore.init();
    isChecking = false;
    
    // Handle routing based on onboarding status
    handleRouting();
    
    // Listen for Electron events
    if (isElectron && (window as any).api?.on) {
      // Handle app initialization
      (window as any).api.on('app:initialized', (data: { needsOnboarding: boolean; mode: string }) => {
        console.log('📨 App initialized:', data);
        
        if (data.needsOnboarding) {
          onboardingStore.reset();
        }
      });
      
      // Handle show onboarding
      (window as any).api.on('show-onboarding', () => {
        console.log('📨 Show onboarding event received');
        goto('/onboarding');
      });
      
      // Handle onboarding completion
      (window as any).api.on('onboarding:completed', () => {
        console.log('✅ Onboarding completed event received');
        goto('/home');
      });
    }
  });
  
  // React to changes in onboarding status
  $: if (!isChecking) {
    handleRouting();
  }
  
  function handleRouting() {
    const currentPath = $page.url.pathname;
    
    // Don't redirect during initial check
    if (isChecking) return;
    
    // If onboarding is required and we're not on the onboarding page
    if ($requiresOnboarding && currentPath !== '/onboarding') {
      console.log('🔄 Redirecting to onboarding...');
      goto('/onboarding');
      return;
    }
    
    // If onboarding is complete and we're on the onboarding page
    if (!$requiresOnboarding && currentPath === '/onboarding') {
      console.log('✅ Onboarding complete, redirecting to home...');
      goto('/home');
      return;
    }
    
    // If onboarding is complete and we're on root, go to home
    if (!$requiresOnboarding && currentPath === '/') {
      goto('/home');
      return;
    }
  }
  
  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
  }
  
  function toggleRightPane() {
    rightPaneCollapsed = !rightPaneCollapsed;
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
          <button on:click={toggleSidebar} class="icon-btn" aria-label="Toggle sidebar">
            {#if sidebarCollapsed}<Menu size={20} />{:else}<X size={20} />{/if}
          </button>
          <h1 class="title">BTIP Studio</h1>
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
        <aside class="sidebar" class:collapsed={sidebarCollapsed} role="navigation" aria-label="Main navigation">
          <nav class="nav">
            <a href="/" class="nav-item" aria-label="Home">
              <Home size={18} aria-hidden="true" />
              {#if !sidebarCollapsed}<span>Home</span>{/if}
            </a>
            <a href="/intents" class="nav-item" aria-label="Intents">
              <FileText size={18} aria-hidden="true" />
              {#if !sidebarCollapsed}<span>Intents</span>{/if}
            </a>
            <a href="/nucleus" class="nav-item" aria-label="Nucleus">
              <Zap size={18} aria-hidden="true" />
              {#if !sidebarCollapsed}<span>Nucleus</span>{/if}
            </a>
            <a href="/projects" class="nav-item" aria-label="Projects">
              <GitBranch size={18} aria-hidden="true" />
              {#if !sidebarCollapsed}<span>Projects</span>{/if}
            </a>
            <a href="/profiles" class="nav-item" aria-label="Profiles">
              <User size={18} aria-hidden="true" />
              {#if !sidebarCollapsed}<span>Profiles</span>{/if}
            </a>
            <a href="/account" class="nav-item" aria-label="Account">
              <Settings size={18} aria-hidden="true" />
              {#if !sidebarCollapsed}<span>Account</span>{/if}
            </a>
          </nav>
        </aside>

        <main class="content" role="main">
          <slot />
        </main>

        <aside class="right-pane" class:collapsed={rightPaneCollapsed} role="region" aria-label="Side panel">
          <button on:click={toggleRightPane} class="collapse-btn" aria-label="Toggle side panel">
            {rightPaneCollapsed ? '◀' : '▶'}
          </button>
          {#if !rightPaneCollapsed}
            <div class="right-content">
              <slot name="right-pane" />
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

  .icon-btn {
    background: transparent;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: background 0.2s;
  }

  .icon-btn:hover {
    background: var(--bg-tertiary);
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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

  .sidebar {
    width: 16rem;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    transition: width 0.3s;
    overflow: hidden;
  }

  .sidebar.collapsed {
    width: 4rem;
  }

  .nav {
    display: flex;
    flex-direction: column;
    padding: 0.5rem;
    gap: 0.25rem;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.75rem;
    color: var(--text-primary);
    text-decoration: none;
    border-radius: 4px;
    transition: background 0.2s;
    white-space: nowrap;
  }

  .nav-item:hover {
    background: var(--bg-tertiary);
  }

  .nav-item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .content {
    flex: 1;
    overflow: auto;
    background: var(--bg-primary);
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