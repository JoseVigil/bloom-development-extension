// webview/app/src/lib/stores/onboarding.ts
// FIXED: Non-blocking init, proper error handling

import { writable, derived, get } from 'svelte/store';
import { goto } from '$app/navigation';
import { checkApiHealth, getOnboardingStatus, getGithubAuthStatus } from '$lib/api';

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
    if (isElectron() && (window as any).api?.invoke) {
      try {
        const result = await Promise.race([
          (window as any).api.invoke('onboarding:status'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
        ]) as any;
        
        if (result?.success) {
          return { completed: result.completed, ...result.steps };
        }
      } catch {}
    }
    
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
    
    return {};
  } catch {
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
    loading: false,
    error: null,
    apiAvailable: false
  };

  const { subscribe, set, update } = writable<OnboardingState>(initial);

  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        update(state => ({ ...state, ...JSON.parse(cached) }));
      } catch {}
    }
    
    Promise.all([loadInitialState(), checkApiHealth()])
      .then(([loaded, apiAvailable]) => {
        update(state => {
          const newState = { ...state, ...loaded, apiAvailable, loading: false };
          if (newState.completed && window.location.pathname === '/onboarding') {
            setTimeout(() => goto('/home'), 100);
          }
          return newState;
        });
      })
      .catch(error => {
        update(state => ({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : 'Init failed'
        }));
      });
  }

  return {
    subscribe,
    
    async checkAuth() {
      const currentState = get({ subscribe });
      if (!currentState.apiAvailable) return;
      
      try {
        const status = await getGithubAuthStatus();
        update(state => {
          const newState = {
            ...state,
            githubAuthenticated: status.authenticated || false,
            geminiConfigured: status.gemini_configured || false
          };
          saveToStorage(newState);
          return newState;
        });
      } catch {}
    },
    
    async checkNucleus() {
      const currentState = get({ subscribe });
      if (!currentState.apiAvailable) return;
      
      try {
        const status = await getOnboardingStatus();
        update(state => {
          const newState = { ...state, hasNucleus: status.steps?.nucleus_created || false };
          saveToStorage(newState);
          return newState;
        });
      } catch {}
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
    }
  };
}

export const onboardingStore = createOnboardingStore();

export const requiresOnboarding = derived(
  onboardingStore,
  $store => !$store.completed
);