// workspace/onboarding/renderer/core/shared-state.js
//
// Estado compartido entre módulos de steps/. Antes vivía como variables
// `let` sueltas al tope de onboarding.js (selectedOrg, activeAccounts,
// workspaceState, etc.) — acá se agrupa en objetos exportados para que
// varios steps puedan leer/escribir sin pisarse y sin que navigation.js o
// ipc-bridge.js tengan que conocer el detalle de cada uno.
//
// Regla: los primitivos (booleans, strings, numbers) que necesitan mutarse
// desde otros módulos van adentro de un objeto (no como `export let x`),
// porque un `let` exportado no es "live binding" reasignable de forma
// consistente entre bundlers/loaders distintos — un objeto sí lo es.

// ── Identity sub-wizard (github → vault → google → gemini) ────────────────
export const identityWizard = {
  stepIndex: 0,               // índice activo en IDENTITY_STEPS (steps/step-github.js)
  discoveryLaunchedThisSession: false,
  pollFallbackTimer: null,
  pollTimeoutId: null,
};

// ── Vault (RF-09) ───────────────────────────────────────────────────────────
export const vaultState = {
  initTriggered: false,
  pollFallbackTimer: null,
};

// ── Cuentas confirmadas del sub-wizard de identity ─────────────────────────
// 'github' | 'google' | 'gemini' | 'vault_init' (ids cortos usados en UI,
// no confundir con los stepId del SSOT — ver IDENTITY_STEPS para el mapeo).
export const activeAccounts = new Set();

// ── Workspace (nucleus_create) ─────────────────────────────────────────────
export const workspaceState = {
  path: '',
  org: '',
  githubVerified: null,   // true | false | null
  _orgDebounceTimer: null,
};

// ── Selección de org / carpeta / proyecto (usado por varios steps) ────────
export const selection = {
  selectedOrg: null,
  selectedFolderPath: null,
  folderSelected: false,
  selectedProjectEl: null,
  selectedProject: null,   // { name, path }
};

// ── Copy dinámico (§7 del spec original) ──────────────────────────────────
export const state = {
  githubUsername: null,
  githubOrg: null,
  selectedOrg: null,
  selectedFolder: null,
  selectedRepo: null,
};

export let userEmail = null;
export function setUserEmail(email) { userEmail = email; }
