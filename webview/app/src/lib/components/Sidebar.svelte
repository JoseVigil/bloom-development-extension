<script lang="ts">
  import { page } from '$app/stores';

  // ============================================================================
  // Sidebar fusionado — Opción 3 (plan-migracion-shell-v1-addendum.md, §2.3 / §6.1)
  //
  // Qué se fusiona:
  //   - Identidad visual: el rail de iconos de btips_workspace_v3.html
  //     (56px, tooltip on hover, logo hex, tokens del design system BTIPS).
  //   - Funcionalidad real: los 6 links que ya existían en +layout.svelte
  //     (/home, /intents, /nucleus, /projects, /profiles, /account), como
  //     <a href> reales de SvelteKit — no los <div onclick> del mock, que
  //     ahí simulaban navegación porque el mock no tiene router.
  //
  // Decisión de diseño explícita (no silenciosa):
  //   El sidebar viejo tenía un toggle expandir/colapsar (mostraba <span>
  //   con el label del link). El mock no tiene ese concepto: es un rail
  //   angosto fijo, y el tooltip on-hover reemplaza la función del label.
  //   Se adopta el comportamiento del mock — el rail queda siempre en
  //   56px — y se elimina la lógica de colapso PARA EL SIDEBAR (el
  //   toggle del right-pane no se toca, es independiente). Si esto no es
  //   lo que se quiere, es reversible: es la única decisión de producto
  //   implícita que tomé para poder avanzar con el fusion hoy.
  //
  // Iconos:
  //   Nucleus, Profiles (mapea a "Accounts" del mock) y Account (mapea a
  //   "Settings" del mock) son el mismo SVG que btips_workspace_v3.html,
  //   sin modificar. Home, Intents y Projects no existían en el mock
  //   (que solo maqueteaba Nucleus/Accounts/Store/Continuity/Settings)
  //   así que son iconos nuevos, dibujados en la misma familia visual
  //   (viewBox 20x20, stroke-width 1.4, sin relleno) para no romper la
  //   identidad. "Store" y "Continuity" del mock no se usan: no
  //   corresponden a ningún link real hoy.
  // ============================================================================

  type NavItem = {
    href: string;
    label: string;
  };

  const navItems: NavItem[] = [
    { href: '/home', label: 'Home' },
    { href: '/intents', label: 'Intents' },
    { href: '/nucleus', label: 'Nucleus' },
    { href: '/projects', label: 'Projects' },
    { href: '/profiles', label: 'Profiles' },
    // PROVISORIO — ver plan-migracion-shell-v1-addendum.md, decisión de
    // sesión posterior al addendum: /genesis no tiene todavía redirect
    // automático (Q-08, sin dueño de backend) ni un tab-bar/GenesisTab que
    // lo aloje (pasos 2-4 del addendum, sin construir). Este ítem es el
    // único acceso manual que existe hoy. Sacarlo de acá cuando exista
    // cualquiera de los dos caminos reales — no es la ubicación definitiva
    // de este link, es un parche de alcanzabilidad.
    { href: '/genesis', label: 'Genesis' }
  ];

  // Account vive separado, en sidebar-bottom, igual que "Settings" en el mock.
  const accountItem: NavItem = { href: '/account', label: 'Account' };

  $: pathname = $page.url.pathname;

  function isActive(href: string): boolean {
    // /intents también cubre /intents/[id], /intents/dev/[id], /intents/doc/[id]
    return pathname === href || pathname.startsWith(href + '/');
  }
</script>

<aside class="sidebar" role="navigation" aria-label="Main navigation">
  <a href="/home" class="sidebar-logo" title="BTIPS" aria-label="BTIPS — Home">
    <div class="logo-hex"></div>
  </a>

  <nav class="sidebar-nav">
    {#each navItems as item (item.href)}
      <a
        href={item.href}
        class="nav-item"
        class:active={isActive(item.href)}
        aria-current={isActive(item.href) ? 'page' : undefined}
        aria-label={item.label}
      >
        <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
          {#if item.href === '/home'}
            <path d="M4 9l6-5 6 5" />
            <path d="M5.5 8v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8" />
            <path d="M8 16v-4h4v4" />
          {:else if item.href === '/intents'}
            <rect x="5" y="3" width="10" height="14" rx="1" />
            <path d="M7.5 7h5M7.5 10h5M7.5 13h3" />
          {:else if item.href === '/nucleus'}
            <circle cx="10" cy="10" r="3" />
            <circle cx="10" cy="10" r="7" stroke-dasharray="2 2" />
            <circle cx="10" cy="3" r="1" fill="currentColor" stroke="none" />
            <circle cx="10" cy="17" r="1" fill="currentColor" stroke="none" />
            <circle cx="3" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="17" cy="10" r="1" fill="currentColor" stroke="none" />
          {:else if item.href === '/projects'}
            <circle cx="6" cy="4" r="1.6" />
            <circle cx="6" cy="16" r="1.6" />
            <circle cx="14" cy="10" r="1.6" />
            <path d="M6 5.6v8.8" />
            <path d="M6 8c0 2.5 2 3 4.5 3H12.4" />
          {:else if item.href === '/profiles'}
            <circle cx="10" cy="7" r="3" />
            <path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6" />
          {:else if item.href === '/genesis'}
            <!-- icono provisorio, misma familia visual (viewBox 20x20,
                 stroke-width 1.4, sin relleno) — no hay ícono de mock para
                 esto porque el mock no contempla /genesis -->
            <path d="M10 3l2.2 4.6L17 9l-3.6 3.1L14.2 17 10 14.4 5.8 17l0.8-4.9L3 9l4.8-1.4z" />
          {/if}
        </svg>
        <span class="nav-tooltip">{item.label}</span>
      </a>
    {/each}
  </nav>

  <div class="sidebar-bottom">
    <a
      href={accountItem.href}
      class="nav-item"
      class:active={isActive(accountItem.href)}
      aria-current={isActive(accountItem.href) ? 'page' : undefined}
      aria-label={accountItem.label}
    >
      <svg class="nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
        <circle cx="10" cy="10" r="2.5" />
        <path d="M10 3v1.5M10 15.5V17M3 10h1.5M15.5 10H17M5.05 5.05l1.06 1.06M13.89 13.89l1.06 1.06M5.05 14.95l1.06-1.06M13.89 6.11l1.06-1.06" />
      </svg>
      <span class="nav-tooltip">{accountItem.label}</span>
    </a>
  </div>
</aside>

<style>
  /* ══════════════════════════════════════════════════════
     Design tokens — copiados 1:1 de btips_workspace_v3.html
     (solo los que usa este componente). Alcance: local al
     sidebar, no se filtran al resto del shell todavía — eso
     es un paso posterior de la migración, no de este.
  ══════════════════════════════════════════════════════ */
  .sidebar {
    --color-bg: #080a0e;
    --color-surface: #0d1117;
    --color-surface-hover: #131820;
    --color-text-primary: #e8eaf0;
    --color-text-secondary: rgba(232, 234, 240, 0.45);
    --color-text-dim: rgba(232, 234, 240, 0.22);
    --color-border: rgba(255, 255, 255, 0.06);
    --color-border-active: rgba(255, 255, 255, 0.18);
    --color-accent: #c8f55a;
    --color-accent-dim: rgba(200, 245, 90, 0.12);
    --font-display: 'Syne', sans-serif;
    --font-mono: 'DM Mono', monospace;
    --space-sm: 12px;
    --radius-md: 4px;
    --duration-fast: 150ms;
    --ease-system: cubic-bezier(0.4, 0, 0.2, 1);
    --sidebar-w: 56px;
    --tab-h: 46px;

    width: var(--sidebar-w);
    flex-shrink: 0;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0;
    z-index: 100;
    position: relative;
  }

  .sidebar-logo {
    width: var(--sidebar-w);
    height: var(--tab-h);
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    text-decoration: none;
  }

  .logo-hex {
    width: 22px;
    height: 22px;
    background: var(--color-accent);
    clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
    position: relative;
  }

  .logo-hex::after {
    content: '';
    position: absolute;
    top: 6px;
    left: 6px;
    width: 10px;
    height: 10px;
    background: var(--color-bg);
    clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
  }

  .sidebar-nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-sm) 0;
    gap: 2px;
    overflow: hidden;
  }

  .nav-item {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    position: relative;
    transition: background var(--duration-fast) var(--ease-system);
    flex-shrink: 0;
    text-decoration: none;
  }

  .nav-item:hover {
    background: var(--color-surface-hover);
  }

  .nav-item.active {
    background: var(--color-accent-dim);
  }

  .nav-item.active .nav-icon {
    color: var(--color-accent);
  }

  .nav-item:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .nav-icon {
    width: 18px;
    height: 18px;
    color: var(--color-text-dim);
    transition: color var(--duration-fast);
    flex-shrink: 0;
  }

  .nav-item:hover .nav-icon {
    color: var(--color-text-secondary);
  }

  .nav-tooltip {
    position: absolute;
    left: calc(100% + 12px);
    top: 50%;
    transform: translateY(-50%);
    background: var(--color-surface);
    border: 1px solid var(--color-border-active);
    color: var(--color-text-primary);
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 5px 10px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--duration-fast);
    z-index: 200;
  }

  /* Hover Y foco de teclado muestran el tooltip — el mock solo tenía
     :hover, pero el rail no tiene labels visibles en ningún estado,
     así que sin esto la navegación por teclado queda sin nombre visible. */
  .nav-item:hover .nav-tooltip,
  .nav-item:focus-visible .nav-tooltip {
    opacity: 1;
  }

  .sidebar-bottom {
    padding: var(--space-sm) 0;
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
</style>
