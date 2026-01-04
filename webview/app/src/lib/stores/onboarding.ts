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
const AUTO_REFRESH_INTERVAL = 3000; // Poll API every 3s

let refreshTimer: ReturnType<typeof setInterval> | null = null;

function isElectron(): boolean {
  return typeof window !== 'undefined' && (window as any).api !== undefined;
}

async function loadInitialState(): Promise<Partial<OnboardingState>> {
  if (typeof window === 'undefined') return {};
  
  try {
    console.log('🔄 [Onboarding] Loading initial state...');
    
    const apiAvailable = await checkApiHealth();
    if (!apiAvailable) {
      console.warn('⚠️ [Onboarding] API not available, using cache');
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    }

    const status = await getOnboardingStatus();
    
    console.log('✅ [Onboarding] Status loaded:', status);
    
    return {
      githubAuthenticated: status.details?.github?.authenticated || false,
      geminiConfigured: status.details?.gemini?.configured || false,
      hasNucleus: status.details?.nucleus?.exists || false,
      hasProjects: status.details?.projects?.linked || false,
      completed: status.completed || false,
      step: (status.current_step as OnboardingStep) || 'welcome',
      apiAvailable: true
    };
  } catch (error) {
    console.error('❌ [Onboarding] Failed to load initial state:', error);
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
    console.log('💾 [Onboarding] State saved to localStorage');
  } catch (error) {
    console.error('❌ [Onboarding] Failed to save to localStorage:', error);
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
    loading: true,
    error: null,
    apiAvailable: false
  };

  const { subscribe, set, update } = writable<OnboardingState>(initial);

  // Initialize store
  if (typeof window !== 'undefined') {
    // Load from cache first (instant UI)
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const cachedState = JSON.parse(cached);
        console.log('📦 [Onboarding] Loaded from cache:', cachedState);
        update(state => ({ ...state, ...cachedState, loading: true }));
      } catch (error) {
        console.error('❌ [Onboarding] Cache parse error:', error);
      }
    }
    
    // Then fetch from API
    Promise.all([loadInitialState(), checkApiHealth()])
      .then(([loaded, apiAvailable]) => {
        update(state => {
          const newState = { 
            ...state, 
            ...loaded, 
            apiAvailable, 
            loading: false,
            error: null
          };
          
          // Auto-advance step based on state
          newState.step = determineCurrentStep(newState);
          
          saveToStorage(newState);
          
          // Redirect if completed
          if (newState.completed && window.location.pathname === '/onboarding') {
            console.log('✅ [Onboarding] Completed, redirecting to /home');
            setTimeout(() => goto('/home'), 100);
          }
          
          return newState;
        });
        
        // Start auto-refresh if on onboarding page
        if (window.location.pathname === '/onboarding') {
          startAutoRefresh();
        }
      })
      .catch(error => {
        console.error('❌ [Onboarding] Init error:', error);
        update(state => ({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : 'Init failed'
        }));
      });
  }

  function determineCurrentStep(state: OnboardingState): OnboardingStep {
    // Don't auto-advance if user manually changed step
    if (state.step && !state.completed) {
      // But validate: can't be on step X if requirement not met
      if (state.step === 'gemini' && !state.githubAuthenticated) return 'welcome';
      if (state.step === 'nucleus' && (!state.githubAuthenticated || !state.geminiConfigured)) return 'gemini';
      if (state.step === 'projects' && !state.hasNucleus) return 'nucleus';
    }
    
    if (!state.githubAuthenticated) return 'welcome';
    if (!state.geminiConfigured) return 'gemini';
    if (!state.hasNucleus) return 'nucleus';
    if (!state.hasProjects) return 'projects';
    
    return 'projects'; // All done
  }

  function startAutoRefresh() {
    if (refreshTimer) return;
    
    console.log('🔄 [Onboarding] Starting auto-refresh');
    
    refreshTimer = setInterval(async () => {
      try {
        const current = get({ subscribe });
        
        // Skip if loading or completed
        if (current.loading || current.completed) return;
        
        const status = await getOnboardingStatus();
        
        update(state => {
          const newState = {
            ...state,
            githubAuthenticated: status.details?.github?.authenticated || false,
            geminiConfigured: status.details?.gemini?.configured || false,
            hasNucleus: status.details?.nucleus?.exists || false,
            hasProjects: status.details?.projects?.linked || false,
            completed: status.completed || false,
            apiAvailable: true,
            error: null
          };
          
          // Auto-advance step
          newState.step = determineCurrentStep(newState);
          
          saveToStorage(newState);
          
          // Check if completed
          if (newState.completed && !state.completed) {
            console.log('🎉 [Onboarding] Completed!');
            stopAutoRefresh();
            setTimeout(() => goto('/home'), 1000);
          }
          
          return newState;
        });
      } catch (error) {
        console.error('❌ [Onboarding] Auto-refresh error:', error);
      }
    }, AUTO_REFRESH_INTERVAL);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
      console.log('⏹️ [Onboarding] Stopped auto-refresh');
    }
  }

  return {
    subscribe,
    
    async refresh() {
      console.log('🔄 [Onboarding] Manual refresh triggered');
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
            step: determineCurrentStep(state),
            loading: false,
            error: null,
            apiAvailable: true
          };
          
          saveToStorage(newState);
          return newState;
        });
        
        console.log('✅ [Onboarding] Refresh completed');
      } catch (error) {
        console.error('❌ [Onboarding] Refresh failed:', error);
        update(state => ({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : 'Refresh failed'
        }));
      }
    },
    
    setStep(step: OnboardingStep) {
      console.log('📍 [Onboarding] Step changed to:', step);
      update(state => {
        const newState = { ...state, step };
        saveToStorage(newState);
        return newState;
      });
    },
    
    async complete() {
      console.log('🎉 [Onboarding] Marking as completed');
      update(state => {
        const newState = { ...state, completed: true };
        saveToStorage(newState);
        return newState;
      });
      
      stopAutoRefresh();
      
      if (typeof window !== 'undefined') {
        setTimeout(() => goto('/home'), 500);
      }
    },
    
    async recheckApi() {
      console.log('🔍 [Onboarding] Rechecking API...');
      const apiAvailable = await checkApiHealth();
      update(state => ({ ...state, apiAvailable }));
      return apiAvailable;
    },
    
    reset() {
      console.log('🔄 [Onboarding] Resetting state');
      
      stopAutoRefresh();
      
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
        
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
        
        return resetState;
      });
      
      if (typeof window !== 'undefined') {
        import('$app/navigation').then(({ goto }) => {
          goto('/onboarding');
        });
      }
    },
    
    // New: Enable auto-refresh manually
    startPolling() {
      startAutoRefresh();
    },
    
    // New: Disable auto-refresh manually
    stopPolling() {
      stopAutoRefresh();
    }
  };
}

export const onboardingStore = createOnboardingStore();

export const requiresOnboarding = derived(
  onboardingStore,
  $store => !$store.completed
);