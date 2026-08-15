// webview/app/src/lib/stores/tabs.ts
//
// Store mínimo para la TabBar del shell. Guarda qué "tabs" (mandates /
// vistas) están abiertas y cuál está activa. No persiste a disco todavía
// (es in-memory, se resetea al recargar el webview) — eso es un paso
// posterior si hace falta.

import { writable, derived, type Readable } from 'svelte/store';

export interface Tab {
  id: string;
  title: string;
  /** Ruta de SvelteKit asociada a este tab, si aplica */
  path?: string;
  /** Si es false, el tab no muestra botón de cerrar (ej. un "Home" fijo) */
  closable?: boolean;
  /**
   * Si está seteado, este tab aloja un MandateTab.svelte para el mandate con
   * este id (en vez de una ruta de SvelteKit vía <slot />). Ver +layout.svelte
   * — es el mecanismo que conecta TabBar/tabsStore con MandateTab genérico
   * (consolidación Genesis-como-Mandate, no un tab-bar nuevo).
   */
  mandateId?: string;
}

interface TabsState {
  tabs: Tab[];
  activeId: string | null;
}

function createTabsStore() {
  const initialState: TabsState = { tabs: [], activeId: null };
  const { subscribe, update, set } = writable<TabsState>(initialState);

  function openTab(tab: Tab) {
    update((state) => {
      const existing = state.tabs.find((t) => t.id === tab.id);
      if (existing) {
        return { ...state, activeId: existing.id };
      }
      const newTab: Tab = { closable: true, ...tab };
      return { tabs: [...state.tabs, newTab], activeId: newTab.id };
    });
  }

  function closeTab(id: string) {
    update((state) => {
      const idx = state.tabs.findIndex((t) => t.id === id);
      if (idx === -1) return state;

      const tabs = state.tabs.filter((t) => t.id !== id);
      let activeId = state.activeId;

      if (activeId === id) {
        const fallback = tabs[idx - 1] ?? tabs[idx] ?? tabs[tabs.length - 1];
        activeId = fallback ? fallback.id : null;
      }

      return { tabs, activeId };
    });
  }

  function setActive(id: string) {
    update((state) =>
      state.tabs.some((t) => t.id === id) ? { ...state, activeId: id } : state
    );
  }

  /**
   * Deselecciona el tab activo sin cerrarlo — el mandate sigue disponible
   * en la TabBar, solo deja de tapar el <slot/> de ruta. Lo usa la
   * navegación del Sidebar (rutas reales) para no quedar enmascarada
   * detrás de un MandateTab activo (ver +layout.svelte content-body).
   */
  function clearActive() {
    update((state) => ({ ...state, activeId: null }));
  }

  function reset() {
    set(initialState);
  }

  return { subscribe, openTab, closeTab, setActive, clearActive, reset };
}

export const tabsStore = createTabsStore();

export const activeTab: Readable<Tab | null> = derived(
  tabsStore,
  ($tabsStore) => $tabsStore.tabs.find((t) => t.id === $tabsStore.activeId) ?? null
);
