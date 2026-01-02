// webview/app/src/lib/stores/onboarding.ts
// VERSIÓN CORREGIDA: No bloquea si las APIs no están disponibles

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
  apiAvailable: boolean; // NUEVO: track si la API está disponible
}

const STORAGE_KEY = 'btip_onboarding';
const API_BASE_URL = 'http://localhost:48215/api/v1';

// Check if we're in Electron environment
function isElectron(): boolean {
  return typeof window !== 'undefined' && window.api !== undefined;
}

// NUEVO: Verificar si la API está disponible
async function checkApiAvailability(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const available = response.ok;
    console.log('[Onboarding] API availability:', available);
    return available;
  } catch (error) {
    console.warn('[Onboarding] API not available:', error);
    return false;
  }
}

// Load from localStorage or Electron IPC
async function loadInitialState(): Promise<Partial<OnboardingState>> {
  if (typeof window === 'undefined') return {};
  
  try {
    console.log('[Onboarding] Loading initial state...');
    
    // If in Electron, check with main process
    if (isElectron() && window.api?.invoke) {
      try {
        const result = await Promise.race([
          window.api.invoke('onboarding:status'),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Electron IPC timeout')), 2000)
          )
        ]);
        
        if (result.success) {
          console.log('[Onboarding] Loaded from Electron:', result);
          return {
            completed: result.completed,
            ...result.steps
          };
        }
      } catch (electronError) {
        console.warn('[Onboarding] Electron IPC failed, using localStorage:', electronError);
      }
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      console.log('[Onboarding] Loaded from localStorage');
      return JSON.parse(stored);
    }
    
    console.log('[Onboarding] No stored state, using defaults');
    return {};
  } catch (error) {
    console.error('[Onboarding] Error loading state:', error);
    return {};
  }
}

function saveToStorage(state: OnboardingState) {
  if (typeof window === 'undefined') return;
  
  try {
    const toSave = {
      step: state.step,
      githubAuthenticated: state.githubAuthenticated,
      geminiConfigured: state.geminiConfigured,
      hasNucleus: state.hasNucleus,
      hasProjects: state.hasProjects,
      completed: state.completed
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    console.log('[Onboarding] Saved to localStorage:', toSave);
  } catch (error) {
    console.error('[Onboarding] Error saving to storage:', error);
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
      console.log('[Onboarding] Synced with Electron');
    }
  } catch (error) {
    console.error('[Onboarding] Error syncing with Electron:', error);
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
    error: null,
    apiAvailable: false
  };

  const { subscribe, set, update } = writable<OnboardingState>(initial);

  // Initialize store on mount
  if (typeof window !== 'undefined') {
    console.log('[Onboarding] Initializing store...');
    
    // NO bloquear la inicialización - hacer las verificaciones en paralelo
    Promise.all([
      loadInitialState(),
      checkApiAvailability()
    ]).then(([loaded, apiAvailable]) => {
      update(state => {
        const newState = {
          ...state,
          ...loaded,
          apiAvailable,
          loading: false
        };
        
        console.log('[Onboarding] Store initialized:', newState);
        
        // Auto-redirect if needed
        if (newState.completed && typeof window !== 'undefined') {
          const path = window.location.pathname;
          if (path === '/onboarding' || path === '/') {
            console.log('[Onboarding] Already completed, redirecting to /home');
            goto('/home');
          }
        }
        
        return newState;
      });
    }).catch(error => {
      console.error('[Onboarding] Initialization error:', error);
      update(state => ({
        ...state,
        loading: false,
        error: 'Failed to initialize: ' + error.message
      }));
    });
  }

  return {
    subscribe,
    
    async init() {
      console.log('[Onboarding] Manual init called');
      update(state => ({ ...state, loading: true, error: null }));
      
      try {
        const [loaded, apiAvailable] = await Promise.all([
          loadInitialState(),
          checkApiAvailability()
        ]);
        
        update(state => ({ 
          ...state, 
          ...loaded,
          apiAvailable,
          loading: false 
        }));
        
        console.log('[Onboarding] Manual init complete');
      } catch (error) {
        console.error('[Onboarding] Manual init error:', error);
        update(state => ({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to initialize'
        }));
      }
    },
    
    async checkAuth() {
      const currentState = get({ subscribe });
      
      // Si la API no está disponible, no hacer la llamada
      if (!currentState.apiAvailable) {
        console.warn('[Onboarding] Skipping auth check - API not available');
        return;
      }
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`${API_BASE_URL}/auth/status`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`API responded with ${response.status}`);
        }
        
        const status = await response.json();
        
        update(state => {
          const newState = {
            ...state,
            githubAuthenticated: status.githubAuthenticated || false,
            geminiConfigured: status.geminiConfigured || false
          };
          saveToStorage(newState);
          console.log('[Onboarding] Auth check complete:', newState);
          return newState;
        });
      } catch (error) {
        console.error('[Onboarding] Auth check failed:', error);
        // NO actualizar el estado de error - solo log
      }
    },
    
    async checkNucleus() {
      const currentState = get({ subscribe });
      
      if (!currentState.apiAvailable) {
        console.warn('[Onboarding] Skipping nucleus check - API not available');
        return;
      }
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`${API_BASE_URL}/nucleus/list`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`API responded with ${response.status}`);
        }
        
        const data = await response.json();
        
        update(state => {
          const newState = { 
            ...state, 
            hasNucleus: (data.nuclei?.length || 0) > 0 
          };
          saveToStorage(newState);
          console.log('[Onboarding] Nucleus check complete:', newState);
          return newState;
        });
      } catch (error) {
        console.error('[Onboarding] Nucleus check failed:', error);
      }
    },
    
    async checkProjects() {
      const currentState = get({ subscribe });
      
      if (!currentState.apiAvailable) {
        console.warn('[Onboarding] Skipping projects check - API not available');
        return;
      }
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`${API_BASE_URL}/projects/list`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`API responded with ${response.status}`);
        }
        
        const data = await response.json();
        
        update(state => {
          const newState = { 
            ...state, 
            hasProjects: (data.projects?.length || 0) > 0 
          };
          saveToStorage(newState);
          console.log('[Onboarding] Projects check complete:', newState);
          return newState;
        });
      } catch (error) {
        console.error('[Onboarding] Projects check failed:', error);
      }
    },
    
    setStep(step: OnboardingStep) {
      update(state => {
        const newState = { ...state, step };
        saveToStorage(newState);
        console.log('[Onboarding] Step changed to:', step);
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
        console.log('[Onboarding] Next step:', nextStep);
        return newState;
      });
    },
    
    async complete() {
      console.log('[Onboarding] Completing onboarding...');
      
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
        console.log('[Onboarding] Redirecting to /home');
        goto('/home');
      }
    },
    
    async reset() {
      console.log('[Onboarding] Resetting onboarding...');
      
      const resetState: OnboardingState = {
        step: 'welcome',
        githubAuthenticated: false,
        geminiConfigured: false,
        hasNucleus: false,
        hasProjects: false,
        completed: false,
        loading: false,
        error: null,
        apiAvailable: await checkApiAvailability()
      };
      
      set(resetState);
      saveToStorage(resetState);
      
      // Reset in Electron if available
      if (isElectron() && window.api?.invoke) {
        try {
          await window.api.invoke('onboarding:reset');
        } catch (error) {
          console.error('[Onboarding] Error resetting in Electron:', error);
        }
      }
      
      // Redirect to onboarding
      if (typeof window !== 'undefined') {
        goto('/onboarding');
      }
    },
    
    // NUEVO: Método para recargar disponibilidad de API
    async recheckApi() {
      const apiAvailable = await checkApiAvailability();
      update(state => ({ ...state, apiAvailable }));
      console.log('[Onboarding] API availability rechecked:', apiAvailable);
      return apiAvailable;
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
    console.log('[Onboarding] Received completed event from Electron');
    onboardingStore.complete();
  });
  
  window.api.on('show-onboarding', () => {
    console.log('[Onboarding] Received show-onboarding event from Electron');
    onboardingStore.reset();
  });
}