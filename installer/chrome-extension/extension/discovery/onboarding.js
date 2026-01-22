// ============================================================================
// ONBOARDING SCRIPT
// onboarding.js
// ============================================================================

class OnboardingFlow {
  constructor() {
    this.currentStep = 'welcome';
    this.googleEmail = null;
    this.apiKeyValidated = false;
    
    this.setupListeners();
    this.checkResume();
  }

  setupListeners() {
    // Escuchar mensajes de background
    chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
      if (msg.event === 'google_login_success') {
        this.handleGoogleLoginSuccess(msg.email);
      }
      
      if (msg.event === 'api_key_validated') {
        this.handleApiKeyValidated();
      }
    });

    // Escuchar cambios en storage
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.onboarding_state) {
        const state = changes.onboarding_state.newValue;
        this.syncWithState(state);
      }
    });
  }

  async checkResume() {
    const result = await chrome.storage.local.get('onboarding_state');
    const state = result.onboarding_state;

    if (!state || !state.active) return;

    // Reanudar desde el último paso
    if (state.googleEmail && !state.geminiKeyValidated) {
      this.googleEmail = state.googleEmail;
      this.showStep('gemini-api');
    } else if (state.geminiKeyValidated) {
      this.showStep('success');
    }
  }

  syncWithState(state) {
    if (state.googleEmail) {
      this.googleEmail = state.googleEmail;
    }
    if (state.geminiKeyValidated) {
      this.apiKeyValidated = true;
    }
  }

  showStep(stepName) {
    // Ocultar todos los steps
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    
    // Mostrar step actual
    const step = document.getElementById(`step-${stepName}`);
    if (step) {
      step.classList.add('active');
      this.currentStep = stepName;
    }
  }

  handleGoogleLoginSuccess(email) {
    this.googleEmail = email;
    this.showStep('gemini-api');
  }

  handleApiKeyValidated() {
    this.apiKeyValidated = true;
    
    const emailEl = document.getElementById('final-email');
    if (emailEl) {
      emailEl.textContent = this.googleEmail || '-';
    }
    
    this.showStep('success');

    // Notificar completado
    setTimeout(() => {
      chrome.runtime.sendMessage({
        event: 'onboarding_complete',
        payload: {
          email: this.googleEmail,
          api_key_validated: true
        }
      });

      // Auto-close
      setTimeout(() => {
        window.close();
      }, 3000);
    }, 2000);
  }
}

// ============================================================================
// GLOBAL FUNCTIONS (llamadas desde HTML)
// ============================================================================

let onboarding;

function startOnboarding() {
  chrome.runtime.sendMessage({
    event: 'onboarding_started'
  });
  
  onboarding.showStep('google-login');
}

function openGoogleLogin() {
  const email = self.SYNAPSE_CONFIG?.email || '';
  const loginUrl = email 
    ? `https://accounts.google.com/v3/signin/identifier?login_hint=${encodeURIComponent(email)}&continue=https://myaccount.google.com/`
    : 'https://accounts.google.com/';

  chrome.tabs.create({ url: loginUrl });
  
  // Cambiar a estado "esperando"
  onboarding.showStep('google-waiting');

  // Actualizar estado
  chrome.storage.local.set({
    onboarding_state: {
      active: true,
      currentStep: 'google_login_waiting',
      startedAt: Date.now()
    }
  });
}

function openAIStudio() {
  chrome.tabs.create({ 
    url: 'https://aistudio.google.com/app/apikey' 
  });
  
  // Cambiar a estado "esperando"
  onboarding.showStep('gemini-waiting');

  // Actualizar estado
  chrome.storage.local.get('onboarding_state', (result) => {
    const state = result.onboarding_state || {};
    chrome.storage.local.set({
      onboarding_state: {
        ...state,
        currentStep: 'gemini_api_waiting'
      }
    });
  });
}

// ============================================================================
// INIT
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  onboarding = new OnboardingFlow();
  console.log('[Onboarding] Ready');
});