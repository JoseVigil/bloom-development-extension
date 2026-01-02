/**
 * BLOOM ERROR CATALOG
 * Centralized error definitions with severity, recovery strategies, and user guidance
 * 
 * @packageDocumentation
 * @module contracts/errors
 */

import type { ErrorCode, ErrorResponse } from './types';

// ============================================================================
// ERROR SEVERITY LEVELS
// ============================================================================

/**
 * Error severity classification
 * 
 * - **critical**: System cannot continue, requires manual intervention
 * - **recoverable**: System can retry automatically
 * - **warning**: Non-blocking issue, system continues with degraded functionality
 */
export type ErrorSeverity = 'critical' | 'recoverable' | 'warning';

/**
 * Retry strategy for recoverable errors
 * 
 * - **immediate**: Retry right away (for transient errors)
 * - **exponential**: Retry with exponential backoff (for rate limits)
 * - **manual**: Require user action before retry (for auth errors)
 * - **none**: Error is not recoverable
 */
export type RetryStrategy = 'immediate' | 'exponential' | 'manual' | 'none';

// ============================================================================
// ERROR CATALOG ENTRY
// ============================================================================

/**
 * Complete error metadata for each error code
 */
export interface ErrorCatalogEntry {
  /** Error severity level */
  severity: ErrorSeverity;
  /** Default error message */
  default_message: string;
  /** User-facing action guidance */
  user_action: string;
  /** Retry strategy (undefined = none) */
  retry_strategy?: RetryStrategy;
  /** HTTP status code (for API responses) */
  http_status?: number;
  /** Related documentation URL */
  docs_url?: string;
  /** Telemetry category */
  telemetry_category?: 'brain_cli' | 'auth' | 'resource' | 'ai_service' | 'system';
}

// ============================================================================
// ERROR CATALOG
// ============================================================================

/**
 * Complete catalog of all system errors
 * This is the single source of truth for error handling
 * 
 * @example
 * ```typescript
 * const catalog = ERROR_CATALOG.INTENT_LOCKED;
 * console.log(catalog.severity); // 'recoverable'
 * console.log(catalog.user_action); // 'Wait for the lock to be released'
 * ```
 */
export const ERROR_CATALOG: Record<ErrorCode, ErrorCatalogEntry> = {
  // ============================================================================
  // BRAIN CLI ERRORS
  // ============================================================================
  
  BRAIN_CLI_UNAVAILABLE: {
    severity: 'critical',
    default_message: 'Brain CLI is not available or not installed',
    user_action: 'Check Python installation and verify Brain module path in settings',
    retry_strategy: 'manual',
    http_status: 503,
    docs_url: '/docs/troubleshooting/brain-cli',
    telemetry_category: 'brain_cli'
  },

  BRAIN_EXECUTION_FAILED: {
    severity: 'critical',
    default_message: 'Brain command execution failed unexpectedly',
    user_action: 'Check error details and try again. If issue persists, check Brain logs',
    retry_strategy: 'manual',
    http_status: 500,
    docs_url: '/docs/troubleshooting/brain-execution',
    telemetry_category: 'brain_cli'
  },

  // ============================================================================
  // AUTHENTICATION ERRORS
  // ============================================================================

  NOT_AUTHENTICATED: {
    severity: 'critical',
    default_message: 'GitHub authentication required to perform this action',
    user_action: 'Complete GitHub authentication in onboarding settings',
    retry_strategy: 'manual',
    http_status: 401,
    docs_url: '/docs/getting-started/authentication',
    telemetry_category: 'auth'
  },

  NOT_NUCLEUS: {
    severity: 'critical',
    default_message: 'Current directory is not a valid Nucleus workspace',
    user_action: 'Create a new Nucleus or open an existing Nucleus directory',
    retry_strategy: 'manual',
    http_status: 400,
    docs_url: '/docs/concepts/nucleus',
    telemetry_category: 'resource'
  },

  AUTH_FAILED: {
    severity: 'critical',
    default_message: 'Authentication failed',
    user_action: 'Verify your credentials and try again',
    retry_strategy: 'manual',
    http_status: 401,
    docs_url: '/docs/getting-started/authentication',
    telemetry_category: 'auth'
  },

  // ============================================================================
  // RESOURCE NOT FOUND ERRORS
  // ============================================================================

  NUCLEUS_NOT_FOUND: {
    severity: 'recoverable',
    default_message: 'Nucleus not found at the specified path',
    user_action: 'Verify the Nucleus path and try again',
    retry_strategy: 'immediate',
    http_status: 404,
    docs_url: '/docs/concepts/nucleus',
    telemetry_category: 'resource'
  },

  INTENT_NOT_FOUND: {
    severity: 'recoverable',
    default_message: 'Intent not found',
    user_action: 'Verify the Intent ID and try again',
    retry_strategy: 'immediate',
    http_status: 404,
    docs_url: '/docs/concepts/intents',
    telemetry_category: 'resource'
  },

  PROJECT_NOT_FOUND: {
    severity: 'recoverable',
    default_message: 'Project not found at the specified path',
    user_action: 'Verify the project path exists and is accessible',
    retry_strategy: 'immediate',
    http_status: 404,
    docs_url: '/docs/concepts/projects',
    telemetry_category: 'resource'
  },

  PROFILE_NOT_FOUND: {
    severity: 'recoverable',
    default_message: 'Chrome profile not found',
    user_action: 'Verify the profile ID is correct or select a different profile',
    retry_strategy: 'immediate',
    http_status: 404,
    docs_url: '/docs/setup/chrome-profiles',
    telemetry_category: 'resource'
  },

  // ============================================================================
  // INTENT LOCKING ERRORS
  // ============================================================================

  INTENT_LOCKED: {
    severity: 'recoverable',
    default_message: 'Intent is currently locked by an active process',
    user_action: 'Wait for the lock to be released or force unlock if safe',
    retry_strategy: 'exponential',
    http_status: 423,
    docs_url: '/docs/concepts/intent-locking',
    telemetry_category: 'resource'
  },

  INTENT_LOCKED_BY_OTHER: {
    severity: 'warning',
    default_message: 'Intent is locked by another user or process',
    user_action: 'Contact the user who locked it or use force unlock with caution',
    retry_strategy: 'manual',
    http_status: 423,
    docs_url: '/docs/concepts/intent-locking',
    telemetry_category: 'resource'
  },

  // ============================================================================
  // AI SERVICE ERRORS
  // ============================================================================

  AI_RATE_LIMIT: {
    severity: 'warning',
    default_message: 'AI service rate limit exceeded',
    user_action: 'Wait a moment and try again. Consider switching to another AI account',
    retry_strategy: 'exponential',
    http_status: 429,
    docs_url: '/docs/ai-services/rate-limits',
    telemetry_category: 'ai_service'
  },

  AI_QUOTA_EXCEEDED: {
    severity: 'warning',
    default_message: 'AI service quota exceeded for current billing period',
    user_action: 'Add another API key/account or wait for quota reset',
    retry_strategy: 'manual',
    http_status: 429,
    docs_url: '/docs/ai-services/quotas',
    telemetry_category: 'ai_service'
  },

  AI_AUTH_FAILED: {
    severity: 'critical',
    default_message: 'AI service authentication failed',
    user_action: 'Verify your API keys and account credentials in profile settings',
    retry_strategy: 'manual',
    http_status: 401,
    docs_url: '/docs/ai-services/authentication',
    telemetry_category: 'ai_service'
  },

  AI_TIMEOUT: {
    severity: 'recoverable',
    default_message: 'AI service request timed out',
    user_action: 'Try again. If issue persists, check your internet connection',
    retry_strategy: 'immediate',
    http_status: 504,
    docs_url: '/docs/troubleshooting/timeouts',
    telemetry_category: 'ai_service'
  },

  RATE_LIMIT_EXCEEDED: {
    severity: 'warning',
    default_message: 'Rate limit exceeded',
    user_action: 'Wait a moment and try again',
    retry_strategy: 'exponential',
    http_status: 429,
    docs_url: '/docs/troubleshooting/rate-limits',
    telemetry_category: 'system'
  },

  // ============================================================================
  // COPILOT ERRORS
  // ============================================================================

  COPILOT_PROMPT_INVALID: {
    severity: 'recoverable',
    default_message: 'Invalid Copilot prompt format or missing required fields',
    user_action: 'Check your prompt structure and required fields',
    retry_strategy: 'immediate',
    http_status: 400,
    docs_url: '/docs/copilot/prompts',
    telemetry_category: 'ai_service'
  },

  COPILOT_CONTEXT_UNKNOWN: {
    severity: 'recoverable',
    default_message: 'Unknown or unsupported Copilot context',
    user_action: 'Verify the context type and parameters',
    retry_strategy: 'immediate',
    http_status: 400,
    docs_url: '/docs/copilot/context',
    telemetry_category: 'ai_service'
  },

  COPILOT_STREAM_ERROR: {
    severity: 'critical',
    default_message: 'Copilot streaming failed unexpectedly',
    user_action: 'Check connection and try again. Report if persists',
    retry_strategy: 'manual',
    http_status: 500,
    docs_url: '/docs/troubleshooting/copilot-stream',
    telemetry_category: 'ai_service'
  },

  COPILOT_PROCESS_NOT_FOUND: {
    severity: 'warning',
    default_message: 'Copilot process not found or already completed',
    user_action: 'Start a new Copilot process if needed',
    retry_strategy: 'none',
    http_status: 404,
    docs_url: '/docs/copilot/processes',
    telemetry_category: 'ai_service'
  },

  COPILOT_CANCELLED: {
    severity: 'warning',
    default_message: 'Copilot process was cancelled by user',
    user_action: 'No action needed, process was intentionally cancelled',
    retry_strategy: 'none',
    http_status: 499,
    docs_url: '/docs/copilot/cancellation',
    telemetry_category: 'ai_service'
  },

  // ============================================================================
  // VALIDATION & SYSTEM ERRORS
  // ============================================================================

  VALIDATION_ERROR: {
    severity: 'recoverable',
    default_message: 'Request data validation failed',
    user_action: 'Check your input data and try again',
    retry_strategy: 'manual',
    http_status: 400,
    docs_url: '/docs/api/validation',
    telemetry_category: 'system'
  },

  INTERNAL_ERROR: {
    severity: 'critical',
    default_message: 'An unexpected internal error occurred',
    user_action: 'Report this error to support with error details',
    retry_strategy: 'manual',
    http_status: 500,
    docs_url: '/docs/support',
    telemetry_category: 'system'
  }
};

// ============================================================================
// ERROR RESPONSE FACTORY
// ============================================================================

/**
 * Create a standard ErrorResponse from an error code
 * 
 * @param code - Standard error code
 * @param message - Optional custom message (overrides default)
 * @param details - Additional error context
 * @returns Fully formed ErrorResponse
 * 
 * @example
 * ```typescript
 * const error = createErrorResponse('INTENT_LOCKED', undefined, {
 *   locked_by: 'copilot-process-123',
 *   locked_at: '2025-01-23T10:00:00Z'
 * });
 * 
 * console.log(error.message); // 'Intent is currently locked by an active process'
 * console.log(error.recoverable); // true
 * console.log(error.retry_after); // 5000 (ms)
 * ```
 */
export function createErrorResponse(
  code: ErrorCode,
  message?: string,
  details?: Record<string, unknown>
): ErrorResponse {
  const catalog = ERROR_CATALOG[code];
  
  // Calculate retry_after based on strategy
  let retryAfter: number | undefined;
  if (catalog.retry_strategy === 'exponential') {
    retryAfter = 5000; // 5 seconds base delay
  } else if (catalog.retry_strategy === 'immediate') {
    retryAfter = 1000; // 1 second
  }
  
  return {
    error: code,
    error_code: code,
    message: message || catalog.default_message,
    details,
    recoverable: catalog.severity !== 'critical',
    retry_after: retryAfter,
    timestamp: new Date().toISOString()
  };
}

/**
 * Create an ErrorResponse from a JavaScript Error object
 * 
 * @param error - Native JavaScript Error
 * @param code - Optional error code (defaults to INTERNAL_ERROR)
 * @returns ErrorResponse
 * 
 * @example
 * ```typescript
 * try {
 *   await dangerousOperation();
 * } catch (err) {
 *   return createErrorFromException(err as Error, 'BRAIN_EXECUTION_FAILED');
 * }
 * ```
 */
export function createErrorFromException(
  error: Error,
  code: ErrorCode = 'INTERNAL_ERROR'
): ErrorResponse {
  return createErrorResponse(code, error.message, {
    stack: error.stack,
    name: error.name
  });
}

// ============================================================================
// ERROR UTILITIES
// ============================================================================

/**
 * Check if an error is recoverable (can be retried)
 */
export function isRecoverableError(code: ErrorCode): boolean {
  return ERROR_CATALOG[code].severity !== 'critical';
}

/**
 * Get retry delay for an error code
 * 
 * @param code - Error code
 * @param attemptNumber - Retry attempt number (for exponential backoff)
 * @returns Milliseconds to wait before retry, or null if not retryable
 */
export function getRetryDelay(code: ErrorCode, attemptNumber = 1): number | null {
  const catalog = ERROR_CATALOG[code];
  
  switch (catalog.retry_strategy) {
    case 'immediate':
      return 1000; // 1 second
    
    case 'exponential':
      // Exponential backoff: 5s, 10s, 20s, 40s, max 60s
      return Math.min(5000 * Math.pow(2, attemptNumber - 1), 60000);
    
    case 'manual':
    case 'none':
    default:
      return null; // Not automatically retryable
  }
}

/**
 * Get user-friendly error message with action guidance
 */
export function getUserErrorMessage(code: ErrorCode): string {
  const catalog = ERROR_CATALOG[code];
  return `${catalog.default_message}. ${catalog.user_action}`;
}

/**
 * Get HTTP status code for an error
 */
export function getHttpStatus(code: ErrorCode): number {
  return ERROR_CATALOG[code].http_status || 500;
}

/**
 * Check if error should be logged to telemetry
 */
export function shouldLogToTelemetry(code: ErrorCode): boolean {
  // Log all errors except validation errors (too noisy)
  return code !== 'VALIDATION_ERROR';
}

/**
 * Get telemetry event name for error
 */
export function getTelemetryEventName(code: ErrorCode): string {
  const catalog = ERROR_CATALOG[code];
  return `error.${catalog.telemetry_category}.${code.toLowerCase()}`;
}

/**
 * Check if error is a Copilot-specific error
 *
 * @param code - Error code to check
 * @returns True if error is Copilot-related
 *
 * @example
 * ```typescript
 * if (isCopilotError('COPILOT_STREAM_ERROR')) {
 * // Handle Copilot-specific error
 * }
 * ```
 */
export function isCopilotError(code: string): boolean {
  return code.startsWith('COPILOT_');
}

/**
 * Format error for user display
 *
 * @param error - ErrorResponse object
 * @returns User-friendly error message
 *
 * @example
 * ```typescript
 * const userMsg = formatErrorForUser(errorResponse);
 * // "Invalid Copilot prompt format or missing required fields. Check your prompt structure and required fields (Details: {...})"
 * ```
 */
export function formatErrorForUser(error: ErrorResponse): string {
  const catalog = ERROR_CATALOG[error.error];
  let message = error.message || catalog.default_message;
  message += `. ${catalog.user_action}`;
  if (error.details) {
    message += ` (Details: ${JSON.stringify(error.details)})`;
  }
  return message;
}

/**
 * Assert error code exists in catalog (throws if invalid)
 * Useful for debugging and type safety
 *
 * @throws Error if code not in catalog
 */
export function assertValidErrorCode(code: string): asserts code is ErrorCode {
  if (!(code in ERROR_CATALOG)) {
    throw new Error(
      `Invalid error code: ${code}. Valid codes: ${Object.keys(ERROR_CATALOG).join(', ')}`
    );
  }
}