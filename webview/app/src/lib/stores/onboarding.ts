import { writable, derived } from 'svelte/store';
import { getProfiles, getNucleusList, getProjects, getAuthStatus } from '$lib/api';

type OnboardingStep = 'welcome' | 'gemini' | 'nucleus' | 'projects';

interface OnboardingState {
  step: OnboardingStep;
  githubAuthenticated: boolean;
  geminiConfigured: boolean;
  hasNucleus: boolean;
  hasProjects: boolean;
  completed: boolean;
}

const STORAGE_KEY = 'btip_onboarding';

function loadFromStorage(): Partial<OnboardingState> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveToStorage(state: OnboardingState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    ...loadFromStorage()
  };

  const { subscribe, set, update } = writable<OnboardingState>(initial);

  return {
    subscribe,
    
    async checkAuth() {
      try {
        const status = await getAuthStatus();
        update(state => {
          const newState = {
            ...state,
            githubAuthenticated: status.githubAuthenticated,
            geminiConfigured: status.geminiConfigured
          };
          saveToStorage(newState);
          return newState;
        });
      } catch (error) {
        console.error('Failed to check auth:', error);
      }
    },
    
    async checkNucleus() {
      try {
        const nuclei = await getNucleusList();
        update(state => {
          const newState = { ...state, hasNucleus: nuclei.length > 0 };
          saveToStorage(newState);
          return newState;
        });
      } catch {}
    },
    
    async checkProjects() {
      try {
        const projects = await getProjects();
        update(state => {
          const newState = { ...state, hasProjects: projects.length > 0 };
          saveToStorage(newState);
          return newState;
        });
      } catch {}
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
    
    complete() {
      update(state => {
        const newState = { ...state, completed: true };
        saveToStorage(newState);
        return newState;
      });
    }
  };
}

export const onboardingStore = createOnboardingStore();