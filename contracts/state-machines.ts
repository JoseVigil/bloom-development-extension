/**
 * BLOOM STATE MACHINES
 * UI state definitions with valid transitions
 * 
 * @packageDocumentation
 * @module contracts/state-machines
 */

import type { Intent, Nucleus, ChromeProfile } from './types';

// ============================================================================
// GENERIC LOADING STATE
// ============================================================================

/**
 * Generic async operation state machine
 * 
 * @example
 * ```typescript
 * const [nucleusList, setNucleusList] = useState<LoadingState<Nucleus[]>>({
 *   status: 'idle',
 *   data: null,
 *   error: null
 * });
 * 
 * // Start loading
 * setNucleusList({ status: 'loading', data: null, error: null });
 * 
 * // Success
 * setNucleusList({ status: 'success', data: [...], error: null });
 * 
 * // Error
 * setNucleusList({ status: 'error', data: null, error: new Error('Failed') });
 * ```
 */
export type LoadingState<T> =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: null; error: Error };

/**
 * Valid transitions for LoadingState
 */
export const LOADING_STATE_TRANSITIONS: Record<LoadingState<unknown>['status'], LoadingState<unknown>['status'][]> = {
  idle: ['loading'],
  loading: ['success', 'error'],
  success: ['loading'], // Can refetch
  error: ['loading', 'idle'] // Can retry or reset
};

// ============================================================================
// INTENT EDITOR STATE
// ============================================================================

/**
 * Intent editor state machine
 * Handles loading, locking, editing, and saving states
 * 
 * State Flow:
 * 1. loading → (locked_by_other | editing | error)
 * 2. locked_by_other → loading (retry)
 * 3. editing → (saving | error)
 * 4. saving → (editing | error)
 * 5. error → loading (retry)
 * 
 * @example
 * ```typescript
 * const [editorState, setEditorState] = useState<IntentEditorState>({
 *   status: 'loading',
 *   intent: null
 * });
 * 
 * // Intent loaded and available for editing
 * setEditorState({
 *   status: 'editing',
 *   intent: { ... }
 * });
 * 
 * // Intent locked by another user
 * setEditorState({
 *   status: 'locked_by_other',
 *   intent: { ... },
 *   locked_by: 'user@example.com'
 * });
 * ```
 */
export type IntentEditorState =
  | { status: 'loading'; intent: null }
  | { status: 'locked_by_other'; intent: Intent; locked_by: string }
  | { status: 'editing'; intent: Intent }
  | { status: 'saving'; intent: Intent }
  | { status: 'error'; intent: Intent | null; error: Error };

/**
 * Valid transitions for IntentEditorState
 */
export const INTENT_EDITOR_TRANSITIONS: Record<IntentEditorState['status'], IntentEditorState['status'][]> = {
  loading: ['locked_by_other', 'editing', 'error'],
  locked_by_other: ['loading'], // User can retry
  editing: ['saving', 'error'],
  saving: ['editing', 'error'],
  error: ['loading'] // User can retry
};

// ============================================================================
// NUCLEUS LIST STATE
// ============================================================================

/**
 * Nucleus list state machine
 * Handles loading and empty states
 * 
 * @example
 * ```typescript
 * const [nucleiState, setNucleiState] = useState<NucleusListState>({
 *   status: 'loading',
 *   nuclei: []
 * });
 * 
 * // Loaded with data
 * setNucleiState({
 *   status: 'loaded',
 *   nuclei: [...]
 * });
 * 
 * // No nuclei found
 * setNucleiState({
 *   status: 'empty',
 *   nuclei: []
 * });
 * ```
 */
export type NucleusListState =
  | { status: 'loading'; nuclei: [] }
  | { status: 'loaded'; nuclei: Nucleus[] }
  | { status: 'empty'; nuclei: [] }
  | { status: 'error'; nuclei: []; error: Error };

/**
 * Valid transitions for NucleusListState
 */
export const NUCLEUS_LIST_TRANSITIONS: Record<NucleusListState['status'], NucleusListState['status'][]> = {
  loading: ['loaded', 'empty', 'error'],
  loaded: ['loading'], // Can refresh
  empty: ['loading'], // Can refresh
  error: ['loading'] // Can retry
};

// ============================================================================
// COPILOT STATE
// ============================================================================

/**
 * Copilot streaming state machine
 * Manages connection, streaming, completion, and errors
 * 
 * State Flow:
 * 1. idle → connecting
 * 2. connecting → (streaming | error)
 * 3. streaming → (completed | error)
 * 4. completed → idle (reset for next prompt)
 * 5. error → idle (reset)
 * 
 * @example
 * ```typescript
 * const [copilotState, setCopilotState] = useState<CopilotState>({
 *   status: 'idle',
 *   streaming: false
 * });
 * 
 * // User sends prompt
 * setCopilotState({ status: 'connecting', streaming: false });
 * 
 * // AI starts streaming
 * setCopilotState({
 *   status: 'streaming',
 *   streaming: true,
 *   chunks: ['Hello', ', ', 'I can help']
 * });
 * 
 * // Streaming complete
 * setCopilotState({
 *   status: 'completed',
 *   streaming: false,
 *   response: 'Hello, I can help you with that...'
 * });
 * ```
 */
export type CopilotState =
  | { status: 'idle'; streaming: false }
  | { status: 'connecting'; streaming: false }
  | { status: 'streaming'; streaming: true; chunks: string[]; processId?: string }
  | { status: 'completed'; streaming: false; response: string }
  | { status: 'cancelled'; streaming: false; partial_response?: string }
  | { status: 'error'; streaming: false; error: Error };

/**
 * Valid transitions for CopilotState
 */
export const COPILOT_STATE_TRANSITIONS: Record<CopilotState['status'], CopilotState['status'][]> = {
  idle: ['connecting'],
  connecting: ['streaming', 'error'],
  streaming: ['completed', 'cancelled', 'error'],
  completed: ['idle'], // Reset for next prompt
  cancelled: ['idle'], // Reset for next prompt
  error: ['idle'] // Reset after error
};

// ============================================================================
// ONBOARDING STATE
// ============================================================================

/**
 * Onboarding wizard state machine
 * Multi-step onboarding process
 * 
 * @example
 * ```typescript
 * const [onboardingState, setOnboardingState] = useState<OnboardingState>({
 *   status: 'github_auth',
 *   completed_steps: []
 * });
 * 
 * // GitHub auth complete
 * setOnboardingState({
 *   status: 'gemini_setup',
 *   completed_steps: ['github_auth']
 * });
 * ```
 */
export type OnboardingState =
  | { status: 'github_auth'; completed_steps: [] }
  | { status: 'gemini_setup'; completed_steps: ['github_auth'] }
  | { status: 'nucleus_creation'; completed_steps: ['github_auth', 'gemini_setup'] }
  | { status: 'project_linking'; completed_steps: ['github_auth', 'gemini_setup', 'nucleus_creation'] }
  | { status: 'completed'; completed_steps: ['github_auth', 'gemini_setup', 'nucleus_creation', 'project_linking'] };

/**
 * Valid transitions for OnboardingState
 */
export const ONBOARDING_TRANSITIONS: Record<OnboardingState['status'], OnboardingState['status'][]> = {
  github_auth: ['gemini_setup'],
  gemini_setup: ['nucleus_creation', 'github_auth'], // Can go back
  nucleus_creation: ['project_linking', 'gemini_setup'], // Can go back
  project_linking: ['completed', 'nucleus_creation'], // Can go back
  completed: [] // Terminal state
};

// ============================================================================
// AI ACCOUNT STATE
// ============================================================================

/**
 * AI account status state machine
 * 
 * @example
 * ```typescript
 * const accountState: AIAccountState = {
 *   status: 'active',
 *   quota_remaining: 500,
 *   last_checked: '2025-01-23T10:00:00Z'
 * };
 * ```
 */
export type AIAccountState =
  | { status: 'active'; quota_remaining: number; last_checked: string }
  | { status: 'checking'; last_checked: string }
  | { status: 'quota_exceeded'; quota_resets_at?: string; last_checked: string }
  | { status: 'error'; error: Error; last_checked: string }
  | { status: 'inactive'; last_checked: string };

/**
 * Valid transitions for AIAccountState
 */
export const AI_ACCOUNT_TRANSITIONS: Record<AIAccountState['status'], AIAccountState['status'][]> = {
  active: ['checking', 'quota_exceeded', 'error'],
  checking: ['active', 'quota_exceeded', 'error', 'inactive'],
  quota_exceeded: ['checking', 'active'], // After quota reset
  error: ['checking', 'inactive'],
  inactive: ['checking'] // User can reactivate
};

// ============================================================================
// PROFILE SELECTOR STATE
// ============================================================================

/**
 * Chrome profile selector state machine
 * 
 * @example
 * ```typescript
 * const [profileState, setProfileState] = useState<ProfileSelectorState>({
 *   status: 'loading',
 *   profiles: []
 * });
 * 
 * setProfileState({
 *   status: 'loaded',
 *   profiles: [...],
 *   selected: profiles[0]
 * });
 * ```
 */
export type ProfileSelectorState =
  | { status: 'loading'; profiles: [] }
  | { status: 'loaded'; profiles: ChromeProfile[]; selected?: ChromeProfile }
  | { status: 'empty'; profiles: [] }
  | { status: 'error'; profiles: []; error: Error };

/**
 * Valid transitions for ProfileSelectorState
 */
export const PROFILE_SELECTOR_TRANSITIONS: Record<ProfileSelectorState['status'], ProfileSelectorState['status'][]> = {
  loading: ['loaded', 'empty', 'error'],
  loaded: ['loading'], // Can refresh
  empty: ['loading'], // Can refresh
  error: ['loading'] // Can retry
};

// ============================================================================
// FILE WATCHER STATE
// ============================================================================

/**
 * File system watcher state
 * 
 * @example
 * ```typescript
 * const [watcherState, setWatcherState] = useState<FileWatcherState>({
 *   status: 'stopped'
 * });
 * 
 * setWatcherState({
 *   status: 'watching',
 *   watched_paths: ['/path/to/intent'],
 *   changes_detected: 0
 * });
 * ```
 */
export type FileWatcherState =
  | { status: 'stopped' }
  | { status: 'starting' }
  | { status: 'watching'; watched_paths: string[]; changes_detected: number }
  | { status: 'error'; error: Error };

/**
 * Valid transitions for FileWatcherState
 */
export const FILE_WATCHER_TRANSITIONS: Record<FileWatcherState['status'], FileWatcherState['status'][]> = {
  stopped: ['starting'],
  starting: ['watching', 'error'],
  watching: ['stopped', 'error'],
  error: ['stopped', 'starting']
};

// ============================================================================
// STATE UTILITIES
// ============================================================================

/**
 * Type guard to check if a state transition is valid
 * 
 * @example
 * ```typescript
 * const canTransition = isValidTransition(
 *   COPILOT_STATE_TRANSITIONS,
 *   'streaming',
 *   'completed'
 * ); // true
 * ```
 */
export function isValidTransition<T extends string>(
  transitions: Record<T, T[]>,
  from: T,
  to: T
): boolean {
  return transitions[from]?.includes(to) ?? false;
}

/**
 * Assert that a state transition is valid (throws if invalid)
 * Useful for debugging state machine violations
 * 
 * @throws Error if transition is invalid
 */
export function assertValidTransition<T extends string>(
  transitions: Record<T, T[]>,
  from: T,
  to: T,
  context?: string
): void {
  if (!isValidTransition(transitions, from, to)) {
    const contextMsg = context ? ` in ${context}` : '';
    throw new Error(
      `Invalid state transition${contextMsg}: ${from} → ${to}. ` +
      `Valid transitions from ${from}: ${transitions[from]?.join(', ') || 'none'}`
    );
  }
}

/**
 * Get next valid states from current state
 */
export function getNextStates<T extends string>(
  transitions: Record<T, T[]>,
  current: T
): T[] {
  return transitions[current] || [];
}

/**
 * Check if state is terminal (no valid transitions)
 */
export function isTerminalState<T extends string>(
  transitions: Record<T, T[]>,
  state: T
): boolean {
  return (transitions[state] || []).length === 0;
}