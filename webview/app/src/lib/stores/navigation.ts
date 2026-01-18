import { writable } from 'svelte/store';
import type { BTIPNode } from '$lib/api';

interface NavigationState {
  tree: BTIPNode[];
  selectedPath: string | null;
  expandedPaths: Set<string>;
  loading: boolean;
  error: string | null;
}

const initialState: NavigationState = {
  tree: [],
  selectedPath: null,
  expandedPaths: new Set(),
  loading: false,
  error: null
};

function createNavigationStore() {
  const { subscribe, set, update } = writable<NavigationState>(initialState);

  return {
    subscribe,
    setTree: (tree: BTIPNode[]) => update(state => ({ ...state, tree, loading: false })),
    setSelectedPath: (path: string | null) => update(state => ({ ...state, selectedPath: path })),
    toggleExpanded: (path: string) => update(state => {
      const expandedPaths = new Set(state.expandedPaths);
      if (expandedPaths.has(path)) {
        expandedPaths.delete(path);
      } else {
        expandedPaths.add(path);
      }
      return { ...state, expandedPaths };
    }),
    setLoading: (loading: boolean) => update(state => ({ ...state, loading })),
    setError: (error: string | null) => update(state => ({ ...state, error })),
    reset: () => set(initialState)
  };
}

export const navigationStore = createNavigationStore();