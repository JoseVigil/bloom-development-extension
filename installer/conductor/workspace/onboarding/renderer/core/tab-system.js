// workspace/onboarding/renderer/core/tab-system.js
//
// Sistema de tabs superior (Onboarding / Harness-debug). No pedido
// explícitamente en la misión, pero es infraestructura de UI ajena al flujo
// de steps — dejarlo en el orquestador (onboarding.js) hubiese ido contra
// el objetivo de "quede limpio" del entregable original.
//
// El iframe #debug-frame se carga con src desde el HTML y está vivo desde
// DOMContentLoaded. switchTab solo alterna visibilidad CSS.
import { log } from './ipc-bridge.js';

let _activeTab = 'onboarding';

export function switchTab(name) {
  if (name === _activeTab) return;
  _activeTab = name;

  document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));

  document.getElementById(`tab-${name}`)?.classList.add('active');
  document.getElementById(`panel-${name}`)?.classList.add('active');

  log('info', `tab: switched to ${name}`);
}

export function getActiveTab() {
  return _activeTab;
}

/** Atajo Ctrl/Cmd+Shift+D → toggle Harness tab. Registrar una vez en boot. */
export function initTabShortcut() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      switchTab(_activeTab === 'harness' ? 'onboarding' : 'harness');
    }
  });
}

/** Live dot del tab Harness — refleja WS state que postea el iframe. */
export function initHarnessMessageBridge() {
  window.addEventListener('message', (evt) => {
    if (!evt.data) return;
    if (evt.data.type === 'HARNESS_WS_STATE') {
      const dot = document.getElementById('harness-live-dot');
      if (dot) dot.className = 'tab-live-dot' + (evt.data.state === 'live' ? ' live' : '');
    }
    if (evt.data.type === 'REQUEST_HEALTH') {
      (async () => {
        try {
          const data = await (window.onboarding?.health?.() ?? window.electronAPI?.health?.());
          document.getElementById('debug-frame')?.contentWindow
            ?.postMessage({ type: 'HEALTH_RESPONSE', data }, '*');
        } catch (e) {
          document.getElementById('debug-frame')?.contentWindow
            ?.postMessage({ type: 'HEALTH_RESPONSE', error: e.message }, '*');
        }
      })();
    }
  });
}
