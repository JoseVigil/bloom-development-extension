// webview/app/src/lib/stores/onboarding.ts
import { writable, derived, get } from 'svelte/store';
import { goto } from '$app/navigation';

type OnboardingStep = 'welcome' | 'gemini' | 'nucleus' | 'projects';

interface OnboardingState {
  step: OnboardingStep;
  githubAuthenticated: boolean;
  geminiConfigured: boolean;
  hasNucleus: boolean;
  hasProjects: boolean;
  completed: boolean;
  loading: boolean;
  error: string | null;
}

const STORAGE_KEY = 'btip_onboarding';

// Check if we're in Electron environment
function isElectron(): boolean {
  return typeof window !== 'undefined' && window.api !== undefined;
}

// Load from localStorage or Electron IPC
async function loadInitialState(): Promise<Partial<OnboardingState>> {
  if (typeof window === 'undefined') return {};
  
  try {
    // If in Electron, check with main process
    if (isElectron() && window.api?.invoke) {
      const result = await window.api.invoke('onboarding:status');
      
      if (result.success) {
        return {
          completed: result.completed,
          ...result.steps
        };
      }
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error loading onboarding state:', error);
    return {};
  }
}

function saveToStorage(state: OnboardingState) {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      step: state.step,
      githubAuthenticated: state.githubAuthenticated,
      geminiConfigured: state.geminiConfigured,
      hasNucleus: state.hasNucleus,
      hasProjects: state.hasProjects,
      completed: state.completed
    }));
  } catch (error) {
    console.error('Error saving to storage:', error);
  }
}

// Sync state with Electron main process
async function syncWithElectron(state: OnboardingState) {
  if (!isElectron() || !window.api?.invoke) return;
  
  try {
    if (state.completed) {
      await window.api.invoke('onboarding:complete', {
        steps: {
          githubAuthenticated: state.githubAuthenticated,
          geminiConfigured: state.geminiConfigured,
          hasNucleus: state.hasNucleus,
          hasProjects: state.hasProjects
        }
      });
    }
  } catch (error) {
    console.error('Error syncing with Electron:', error);
  }
}

function createOnboardingStore() {
  const initial: OnboardingState = {
    step: 'welcome',
    githubAuthenticated: false,
    geminiConfigured: false,
    hasNucleus: false,
    hasProjects: false,
    completed: false,
    loading: false,
    error: null
  };

  const { subscribe, set, update } = writable<OnboardingState>(initial);

  // Initialize store on mount
  if (typeof window !== 'undefined') {
    loadInitialState().then(loaded => {
      update(state => ({ ...state, ...loaded }));
      
      // Auto-redirect if needed
      const currentState = get({ subscribe });
      if (currentState.completed && typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (path === '/onboarding' || path === '/') {
          goto('/home');
        }
      }
    });
  }

  return {
    subscribe,
    
    async init() {
      update(state => ({ ...state, loading: true, error: null }));
      
      try {
        const loaded = await loadInitialState();
        update(state => ({ 
          ...state, 
          ...loaded, 
          loading: false 
        }));
      } catch (error) {
        update(state => ({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to initialize'
        }));
      }
    },
    
    async checkAuth() {
      try {
        // Call your API to check authentication status
        const response = await fetch('/api/auth/status');
        const status = await response.json();
        
        update(state => {
          const newState = {
            ...state,
            githubAuthenticated: status.githubAuthenticated || false,
            geminiConfigured: status.geminiConfigured || false
          };
          saveToStorage(newState);
          return newState;
        });
      } catch (error) {
        console.error('Failed to check auth:', error);
        update(state => ({
          ...state,
          error: 'Failed to check authentication status'
        }));
      }
    },
    
    async checkNucleus() {
      try {
        const response = await fetch('/api/nucleus/list');
        const data = await response.json();
        
        update(state => {
          const newState = { 
            ...state, 
            hasNucleus: (data.nuclei?.length || 0) > 0 
          };
          saveToStorage(newState);
          return newState;
        });
      } catch (error) {
        console.error('Failed to check nucleus:', error);
      }
    },
    
    async checkProjects() {
      try {
        const response = await fetch('/api/projects/list');
        const data = await response.json();
        
        update(state => {
          const newState = { 
            ...state, 
            hasProjects: (data.projects?.length || 0) > 0 
          };
          saveToStorage(newState);
          return newState;
        });
      } catch (error) {
        console.error('Failed to check projects:', error);
      }
    },
    
    setStep(step: OnboardingStep) {
      update(state => {
        const newState = { ...state, step };
        saveToStorage(newState);
        return newState;
      });
    },
    
    nextStep() {
      update(state => {
        let nextStep: OnboardingStep = state.step;
        
        if (state.step === 'welcome' && state.githubAuthenticated) {
          nextStep = 'gemini';
        } else if (state.step === 'gemini' && state.geminiConfigured) {
          nextStep = 'nucleus';
        } else if (state.step === 'nucleus' && state.hasNucleus) {
          nextStep = 'projects';
        }
        
        const newState = { ...state, step: nextStep };
        saveToStorage(newState);
        return newState;
      });
    },
    
    async complete() {
      update(state => {
        const newState = { ...state, completed: true, loading: true };
        saveToStorage(newState);
        return newState;
      });

      // Sync with Electron if available
      const currentState = get({ subscribe });
      await syncWithElectron(currentState);

      update(state => ({ ...state, loading: false }));

      // Redirect to home
      if (typeof window !== 'undefined') {
        goto('/home');
      }
    },
    
    async reset() {
      const resetState: OnboardingState = {
        step: 'welcome',
        githubAuthenticated: false,
        geminiConfigured: false,
        hasNucleus: false,
        hasProjects: false,
        completed: false,
        loading: false,
        error: null
      };
      
      set(resetState);
      saveToStorage(resetState);
      
      // Reset in Electron if available
      if (isElectron() && window.api?.invoke) {
        try {
          await window.api.invoke('onboarding:reset');
        } catch (error) {
          console.error('Error resetting onboarding in Electron:', error);
        }
      }
      
      // Redirect to onboarding
      if (typeof window !== 'undefined') {
        goto('/onboarding');
      }
    }
  };
}

export const onboardingStore = createOnboardingStore();

// Derived store for checking if onboarding is required
export const requiresOnboarding = derived(
  onboardingStore,
  $store => !$store.completed
);

// Listen for Electron events if available
if (typeof window !== 'undefined' && window.api?.on) {
  window.api.on('onboarding:completed', () => {
    onboardingStore.complete();
  });
  
  window.api.on('show-onboarding', () => {
    onboardingStore.reset();
  });
}