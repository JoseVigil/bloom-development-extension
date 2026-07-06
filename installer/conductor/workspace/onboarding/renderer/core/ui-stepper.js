// workspace/onboarding/renderer/core/ui-stepper.js
//
// Manipulación del sidebar visual (.step-node). Sin cambios de lógica
// respecto al monolito, salvo que navigateToStep(nodeName) ya no llama a
// goTo(n) por índice — llama a navigation.navigateToNode(nodeName), que
// resuelve el stepId "de entrada" para ese nodo contra el SSOT.
//
// STEPPER_NODES / STEPPER_STATUSES se mantienen tal cual (son puramente de
// presentación — orden e índice del DOM del sidebar), no del SSOT de steps.
// navigation.js es quien traduce stepId → nodeName vía el campo `view` del
// SSOT; este módulo no conoce stepIds, solo nombres de nodo.

import { log } from './ipc-bridge.js';

// Índice del .step-node en el sidebar. El orden refleja el orden real de
// dependencias (nucleus antes que vault — ver comentario histórico "Fix D"
// en el monolito original).
export const STEPPER_NODES = { workspace: 0, identity: 1, providers: 2, project: 3, mandate: 4 };

export const STEPPER_STATUSES = {
  workspace: 'Configured',
  identity: 'Active',
  providers: 'Connected',
  project: 'Active',
  mandate: 'Persistent',
};

// navigation.js inyecta esto para no depender de navigation.js directamente
// (evita import circular ui-stepper ↔ navigation). Se setea una vez en
// onboarding.js durante el bootstrap.
let _onNodeClick = null;
export function bindNodeClickHandler(fn) {
  _onNodeClick = fn;
}

export function handleStepperNodeClick(nodeName) {
  const idx = STEPPER_NODES[nodeName];
  if (idx === undefined) return;
  const nodes = document.querySelectorAll('.step-node');
  const node = nodes[idx];
  if (!node) return;

  // Navegación libre: el usuario puede saltar a cualquier step del stepper,
  // completado o no. No bloqueamos por 'pending' — es responsabilidad de
  // cada screen mostrar un estado vacío si le faltan datos.
  const isPending = node.classList.contains('pending');
  if (isPending) {
    log('info', `stepper click → ${nodeName} — step aún no completado, navegando igual`);
  }

  log('info', `stepper click → ${nodeName}`);
  _onNodeClick?.(nodeName);
}

export function setStepperActive(nodeName) {
  const idx = STEPPER_NODES[nodeName];
  if (idx === undefined) return;
  const nodes = document.querySelectorAll('.step-node');
  nodes.forEach(n => n.classList.remove('active'));
  if (nodes[idx]) nodes[idx].classList.add('active');
  log('info', `stepper: active → ${nodeName}`);
  refreshStepperPendingStates();
}

export function setStepperEstablished(nodeName) {
  const idx = STEPPER_NODES[nodeName];
  if (idx === undefined) return;
  const nodes = document.querySelectorAll('.step-node');
  if (nodes[idx]) {
    nodes[idx].classList.remove('active');
    nodes[idx].classList.add('established');
  }
  log('info', `stepper: established → ${nodeName}`);
  refreshStepperPendingStates();
}

// Marca como 'pending' (atenuado, pero igual navegable) cualquier nodo que
// no esté ni 'established' ni 'active'. Se recalcula cada vez que cambia el
// estado del stepper.
export function refreshStepperPendingStates() {
  document.querySelectorAll('.step-node').forEach(n => {
    const isDone = n.classList.contains('established');
    const isActive = n.classList.contains('active');
    n.classList.toggle('pending', !isDone && !isActive);
  });
}
