// workspace/onboarding/renderer/core/notifications.js
//
// addNotification() — único punto de escritura en #notification-list.
// Se extrae a su propio módulo (no pedido explícitamente en la misión,
// pero necesario: lo usan TODOS los steps + ipc-bridge.js, y ponerlo
// adentro de cualquiera de ellos habría creado un import cruzado steps↔steps
// que el resto de la modularización busca evitar).
//
// opts:
//   icon {string} — emoji o símbolo (default '·')
//   type {string} — 'success' | 'warn' | 'error' | '' (estilo neutro)
import { log } from './ipc-bridge.js';

export function addNotification(text, { icon = '·', type = '' } = {}) {
  const list = document.getElementById('notification-list');
  if (!list) return;

  const card = document.createElement('div');
  card.className = ['notif-card', type].filter(Boolean).join(' ');

  const dot = document.createElement('span');
  dot.className = 'notif-dot';
  dot.textContent = icon;

  const msg = document.createElement('span');
  msg.className = 'notif-text';
  msg.textContent = text;

  const close = document.createElement('button');
  close.className = 'notif-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.onclick = () => card.remove();

  card.appendChild(dot);
  card.appendChild(msg);
  card.appendChild(close);

  // Insertar al inicio — la más reciente queda arriba
  list.insertBefore(card, list.firstChild);

  log('info', `notification: [${type || 'info'}] ${text}`);
}
