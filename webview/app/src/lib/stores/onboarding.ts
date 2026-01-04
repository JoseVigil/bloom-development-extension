// webview/app/src/lib/stores/onboarding.ts

import { writable, derived, get } from 'svelte/store';
import { goto } from '$app/navigation';
import { checkApiHealth, getOnboardingStatus } from '$lib/api';

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
  apiAvailable: boolean;
}

const STORAGE_KEY = 'btip_onboarding';

function isElectron(): boolean {
  return typeof window !== 'undefined' && (window as any).api !== undefined;
}

async function loadInitialState(): Promise<Partial<OnboardingState>> {
  if (typeof window === 'undefined') return {};
  
  try {
    // Check API health first
    const apiAvailable = await checkApiHealth();
    if (!apiAvailable) {
      console.warn('[Onboarding] API not available, using cache');
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    }

    // Use NEW endpoint: /api/v1/health/onboarding
    const status = await getOnboardingStatus();
    
    return {
      githubAuthenticated: status.details?.github?.authenticated || false,
      geminiConfigured: status.details?.gemini?.configured || false,
      hasNucleus: status.details?.nucleus?.exists || false,
      hasProjects: status.details?.projects?.linked || false,
      completed: status.completed || false,
      step: (status.current_step as OnboardingStep) || 'welcome'
    };
  } catch (error) {
    console.error('[Onboarding] Failed to load initial state:', error);
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
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
  } catch {}
}

function createOnboardingStore() {
  const initial: OnboardingState = {
    step: 'welcome',
    githubAuthenticated: false,
    geminiConfigured: false,
    hasNucleus: false,
    hasProjects: false,
    completed: false,
    loading: true,
    error: null,
    apiAvailable: false
  };

  const { subscribe, set, update } = writable<OnboardingState>(initial);

  // Non-blocking initialization
  if (typeof window !== 'undefined') {
    // Try cache first
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        update(state => ({ ...state, ...JSON.parse(cached), loading: true }));
      } catch {}
    }
    
    // Then load from API
    Promise.all([loadInitialState(), checkApiHealth()])
      .then(([loaded, apiAvailable]) => {
        update(state => {
          const newState = { ...state, ...loaded, apiAvailable, loading: false };
          saveToStorage(newState);
          
          if (newState.completed && window.location.pathname === '/onboarding') {
            setTimeout(() => goto('/home'), 100);
          }
          return newState;
        });
      })
      .catch(error => {
        console.error('[Onboarding] Init error:', error);
        update(state => ({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : 'Init failed'
        }));
      });
  }

  return {
    subscribe,
    
    async refresh() {
      update(state => ({ ...state, loading: true, error: null }));
      
      try {
        const status = await getOnboardingStatus();
        
        update(state => {
          const newState = {
            ...state,
            githubAuthenticated: status.details?.github?.authenticated || false,
            geminiConfigured: status.details?.gemini?.configured || false,
            hasNucleus: status.details?.nucleus?.exists || false,
            hasProjects: status.details?.projects?.linked || false,
            completed: status.completed || false,
            step: (status.current_step as OnboardingStep) || state.step,
            loading: false,
            error: null
          };
          saveToStorage(newState);
          return newState;
        });
      } catch (error) {
        update(state => ({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : 'Refresh failed'
        }));
      }
    },
    
    setStep(step: OnboardingStep) {
      update(state => {
        const newState = { ...state, step };
        saveToStorage(newState);
        return newState;
      });
    },
    
    async complete() {
      update(state => {
        const newState = { ...state, completed: true };
        saveToStorage(newState);
        return newState;
      });
      if (typeof window !== 'undefined') goto('/home');
    },
    
    async recheckApi() {
      const apiAvailable = await checkApiHealth();
      update(state => ({ ...state, apiAvailable }));
      return apiAvailable;
    },
    
    // ========================================================================
    // NUEVO: Reset method para Electron events
    // ========================================================================
    reset() {
      console.log('🔄 [Store] Resetting onboarding state');
     
      update(state => {
        const resetState = {
          ...state,
          step: 'welcome' as OnboardingStep,
          githubAuthenticated: false,
          geminiConfigured: false,
          hasNucleus: false,
          hasProjects: false,
          completed: false,
          loading: false,
          error: null
        };
       
        // Clear localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
       
        return resetState;
      });
     
      // Navigate to onboarding if in browser
      if (typeof window !== 'undefined') {
        import('$app/navigation').then(({ goto }) => {
          goto('/onboarding');
        });
      }
    }
  };
}

export const onboardingStore = createOnboardingStore();

export const requiresOnboarding = derived(
  onboardingStore,
  $store => !$store.completed
);