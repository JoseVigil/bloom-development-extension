"use strict";
/**
 * BLOOM STATE MACHINES
 * UI state definitions with valid transitions
 *
 * @packageDocumentation
 * @module contracts/state-machines
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FILE_WATCHER_TRANSITIONS = exports.PROFILE_SELECTOR_TRANSITIONS = exports.AI_ACCOUNT_TRANSITIONS = exports.ONBOARDING_TRANSITIONS = exports.AI_EXECUTION_STATE_TRANSITIONS = exports.NUCLEUS_LIST_TRANSITIONS = exports.INTENT_EDITOR_TRANSITIONS = exports.LOADING_STATE_TRANSITIONS = void 0;
exports.isValidTransition = isValidTransition;
exports.assertValidTransition = assertValidTransition;
exports.getNextStates = getNextStates;
exports.isTerminalState = isTerminalState;
/**
 * Valid transitions for LoadingState
 */
exports.LOADING_STATE_TRANSITIONS = {
    idle: ['loading'],
    loading: ['success', 'error'],
    success: ['loading'], // Can refetch
    error: ['loading', 'idle'] // Can retry or reset
};
/**
 * Valid transitions for IntentEditorState
 */
exports.INTENT_EDITOR_TRANSITIONS = {
    loading: ['locked_by_other', 'editing', 'error'],
    locked_by_other: ['loading'], // User can retry
    editing: ['saving', 'error'],
    saving: ['editing', 'error'],
    error: ['loading'] // User can retry
};
/**
 * Valid transitions for NucleusListState
 */
exports.NUCLEUS_LIST_TRANSITIONS = {
    loading: ['loaded', 'empty', 'error'],
    loaded: ['loading'], // Can refresh
    empty: ['loading'], // Can refresh
    error: ['loading'] // Can retry
};
/**
 * Valid transitions for AIExecutionState
 */
exports.AI_EXECUTION_STATE_TRANSITIONS = {
    idle: ['connecting'],
    connecting: ['streaming', 'error'],
    streaming: ['completed', 'cancelled', 'error'],
    completed: ['idle'], // Reset for next prompt
    cancelled: ['idle'], // Reset for next prompt
    error: ['idle'] // Reset after error
};
/**
 * Valid transitions for OnboardingState
 */
exports.ONBOARDING_TRANSITIONS = {
    github_auth: ['gemini_setup'],
    gemini_setup: ['nucleus_creation', 'github_auth'], // Can go back
    nucleus_creation: ['project_linking', 'gemini_setup'], // Can go back
    project_linking: ['completed', 'nucleus_creation'], // Can go back
    completed: [] // Terminal state
};
/**
 * Valid transitions for AIAccountState
 */
exports.AI_ACCOUNT_TRANSITIONS = {
    active: ['checking', 'quota_exceeded', 'error'],
    checking: ['active', 'quota_exceeded', 'error', 'inactive'],
    quota_exceeded: ['checking', 'active'], // After quota reset
    error: ['checking', 'inactive'],
    inactive: ['checking'] // User can reactivate
};
/**
 * Valid transitions for ProfileSelectorState
 */
exports.PROFILE_SELECTOR_TRANSITIONS = {
    loading: ['loaded', 'empty', 'error'],
    loaded: ['loading'], // Can refresh
    empty: ['loading'], // Can refresh
    error: ['loading'] // Can retry
};
/**
 * Valid transitions for FileWatcherState
 */
exports.FILE_WATCHER_TRANSITIONS = {
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
 *   AI_EXECUTION_STATE_TRANSITIONS,
 *   'streaming',
 *   'completed'
 * ); // true
 * ```
 */
function isValidTransition(transitions, from, to) {
    return transitions[from]?.includes(to) ?? false;
}
/**
 * Assert that a state transition is valid (throws if invalid)
 * Useful for debugging state machine violations
 *
 * @throws Error if transition is invalid
 */
function assertValidTransition(transitions, from, to, context) {
    if (!isValidTransition(transitions, from, to)) {
        const contextMsg = context ? ` in ${context}` : '';
        throw new Error(`Invalid state transition${contextMsg}: ${from} → ${to}. ` +
            `Valid transitions from ${from}: ${transitions[from]?.join(', ') || 'none'}`);
    }
}
/**
 * Get next valid states from current state
 */
function getNextStates(transitions, current) {
    return transitions[current] || [];
}
/**
 * Check if state is terminal (no valid transitions)
 */
function isTerminalState(transitions, state) {
    return (transitions[state] || []).length === 0;
}
//# sourceMappingURL=state-machines.js.map