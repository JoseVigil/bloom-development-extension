// webview/app/src/lib/stores/onboarding.ts

import { writable, derived, get } from 'svelte/store';
import { goto } from '$app/navigation';
import { checkApiHealth, getOnboardingStatus } from '$lib/api';
import type { OnboardingStatus, OnboardingStep } from '$contracts/types';


/**
 * Interfaz que combina los datos de la API con el estado de la UI
 */
interface OnboardingState extends OnboardingStatus {
  loading: boolean;
  error: string | null;
  apiAvailable: boolean;
}

const STORAGE_KEY = 'btip_onboarding';
const AUTO_REFRESH_INTERVAL = 3000;

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Utilidad para detectar si estamos en Electron
 */
function isElectron(): boolean {
  return typeof window !== 'undefined' && (window as any).api !== undefined;
}

/**
 * Guarda los datos esenciales en LocalStorage para persistencia entre recargas
 */
function saveToStorage(state: OnboardingState) {
  if (typeof window === 'undefined') return;
  try {
    // Solo persistimos datos del contrato, no estados de carga
    const dataToPersist = {
      current_step: state.current_step,
      details: state.details,
      completed: state.completed,
      completion_percentage: state.completion_percentage
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToPersist));
  } catch (error) {
    console.error('❌ [Onboarding] Failed to save to localStorage:', error);
  }
}

function createOnboardingStore() {
  // 1. ESTADO INICIAL (Cumple estrictamente con la interfaz)
  const initial: OnboardingState = {
    ready: false,
    current_step: 'welcome',
    completed: false,
    completion_percentage: 0,
    timestamp: new Date().toISOString(),
    details: {
      github: { authenticated: false },
      twitter: { authenticated: false},
      gemini: { configured: false, key_count: 0 },
      nucleus: { exists: false, nucleus_count: 0 },
      projects: { added: false, count: 0 }
    },
    loading: true,
    error: null,
    apiAvailable: false
  };

  const { subscribe, set, update } = writable<OnboardingState>(initial);

  /**
   * Determina el paso actual basándose en la jerarquía de requisitos
   */
  function determineCurrentStep(state: OnboardingState): OnboardingStep {
    const d = state.details;
    if (!d.github.authenticated) return 'welcome';
    if (!d.twitter.authenticated) return 'twitter'; 
    if (!d.gemini.configured) return 'gemini';
    if (!d.nucleus.exists) return 'nucleus';
    if (!d.projects.added) return 'projects';
    return 'projects';
  }

  /**
   * Sincroniza el estado con la API
   */
  async function refreshStatus() {
    try {
      const apiAvailable = await checkApiHealth();
      if (!apiAvailable) {
        update(state => ({ ...state, apiAvailable: false, loading: false }));
        return;
      }

      const status = await getOnboardingStatus();
      
      update(state => {
        const newState = {
          ...state,
          ...status,
          apiAvailable: true,
          loading: false,
          error: null,
          current_step: determineCurrentStep({ ...state, ...status } as OnboardingState)
        } as OnboardingState;
        
        saveToStorage(newState);

        if (newState.completed && window.location.pathname === '/onboarding') {
          console.log('✅ [Onboarding] Completed, redirecting...');
          setTimeout(() => goto('/home'), 500);
        }
        
        return newState;
    });

    } catch (error) {
      console.error('❌ [Onboarding] Refresh error:', error);
      update(state => ({ 
        ...state, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch status' 
      }));
    }
  }

  // --- LÓGICA DE INICIALIZACIÓN ---
  if (typeof window !== 'undefined') {
    // Intentar cargar desde cache para evitar parpadeos
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const cachedData = JSON.parse(cached);
        update(state => ({ ...state, ...cachedData, loading: true }));
      } catch (e) {
        console.error('❌ [Onboarding] Cache error:', e);
      }
    }
    
    // Disparar primer check real
    refreshStatus().then(() => {
      if (window.location.pathname === '/onboarding') {
        startAutoRefresh();
      }
    });
  }

  function startAutoRefresh() {
    if (refreshTimer) return;
    console.log('🔄 [Onboarding] Starting polling');
    refreshTimer = setInterval(refreshStatus, AUTO_REFRESH_INTERVAL);
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
      console.log('⏹️ [Onboarding] Stopped polling');
    }
  }

  // --- MÉTODOS PÚBLICOS ---
  return {
    subscribe,
    refresh: refreshStatus,
    
    setStep(step: OnboardingStep) {
      update(state => {
        const newState = { ...state, current_step: step };
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
      stopAutoRefresh();
      setTimeout(() => goto('/home'), 500);
    },
    
    reset() {
      stopAutoRefresh();
      localStorage.removeItem(STORAGE_KEY);
      // Forzar recarga limpia
      if (typeof window !== 'undefined') {
        window.location.href = '/onboarding';
      }
    },
    
    startPolling: startAutoRefresh,
    stopPolling: stopAutoRefresh
  };
}

export const onboardingStore = createOnboardingStore();

/**
 * Store derivado para saber si el usuario debe estar bloqueado en onboarding
 */
export const requiresOnboarding = derived(
  onboardingStore,
  $store => !$store.completed
);