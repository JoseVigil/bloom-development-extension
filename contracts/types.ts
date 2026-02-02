/**
 * BLOOM INTEGRATION CONTRACT - TYPES
 * Single source of truth for all system types
 * 
 * @packageDocumentation
 * @module contracts/types
 */

// ============================================================================
// AI PROVIDER TYPES
// ============================================================================

export interface AIProvider {
  id: 'ollama' | 'gemini';
  capabilities: ('streaming' | 'local' | 'auth-required')[];
  config?: Record<string, any>;
}

export interface AIPromptPayload {
  context: 'onboarding' | 'genesis' | 'dev' | 'doc' | 'general';
  text: string;
  intentId?: string;
  profileId?: string;
  provider?: AIProvider['id'];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// BRAIN CLI TYPES - Lo que Brain retorna
// ============================================================================

/**
 * Generic result wrapper from Brain CLI commands
 * 
 * @example
 * ```typescript
 * const result: BrainResult<Nucleus> = {
 *   status: 'success',
 *   operation: 'nucleus:list',
 *   data: { id: '123', organization: 'MyOrg', ... }
 * }
 * ```
 */
export interface BrainResult<T = unknown> {
  /** Command execution status */
  status: 'success' | 'error' | 'not_authenticated' | 'not_nucleus';
  /** Brain operation executed (e.g., 'nucleus:create') */
  operation?: string;
  /** Success message */
  message?: string;
  /** Error message if status is 'error' */
  error?: string;
  /** Typed data payload */
  data?: T;
  /** Additional metadata from Brain */
  [key: string]: unknown;
}

// ============================================================================
// NUCLEUS TYPES
// ============================================================================

/**
 * Core Nucleus entity representing a development workspace
 * 
 * @example
 * ```typescript
 * const nucleus: Nucleus = {
 *   id: 'nucleus-abc123',
 *   organization: 'acme-corp',
 *   path: '/Users/dev/bloom/acme-nucleus',
 *   repo_url: 'https://github.com/acme/nucleus',
 *   projects_count: 3,
 *   intents_count: 12,
 *   created_at: '2025-01-15T10:30:00Z'
 * }
 * ```
 */
export interface Nucleus {
  /** Unique nucleus identifier */
  id: string;
  /** Organization name (slug format) */
  organization: string;
  /** Absolute filesystem path */
  path: string;
  /** GitHub repository URL (optional) */
  repo_url?: string;
  /** Number of linked projects */
  projects_count: number;
  /** Number of intents created */
  intents_count: number;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last sync timestamp */
  last_sync?: string;
}

/**
 * Nucleus configuration stored in nucleus-config.json
 * 
 * @example
 * ```typescript
 * const config: NucleusConfig = {
 *   organization: 'acme-corp',
 *   created_at: '2025-01-15T10:30:00Z',
 *   repo_url: 'https://github.com/acme/nucleus',
 *   onboarding: {
 *     completed: true,
 *     completed_at: '2025-01-15T11:00:00Z',
 *     steps: {
 *       github_auth: true,
 *       gemini_setup: true,
 *       nucleus_created: true,
 *       projects_linked: true
 *     }
 *   }
 * }
 * ```
 */
export interface NucleusConfig {
  /** Organization name */
  organization: string;
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** GitHub repository URL (optional) */
  repo_url?: string;
  /** Onboarding progress state */
  onboarding: OnboardingState;
}

/**
 * Onboarding progress tracking
 */
export interface OnboardingState {
  /** Whether onboarding is complete */
  completed: boolean;
  /** ISO 8601 completion timestamp */
  completed_at?: string;
  /** Individual step completion status */
  steps: {
    github_auth: boolean;
    gemini_setup: boolean;
    nucleus_created: boolean;
    projects_linked: boolean;
    ollama_setup: boolean;
  };
}

export type OnboardingStep = 'welcome' | 'twitter' | 'gemini' | 'nucleus' | 'projects';

export interface TwitterAuthStatus {
    authenticated: boolean;
    username?: string;
    error?: string;
}

export interface OnboardingStatusDetails {
  github: { authenticated: boolean; username?: string };
  twitter: TwitterAuthStatus; 
  gemini: { configured: boolean; key_count: number };
  nucleus: { exists: boolean; nucleus_count: number };
  projects: { added: boolean; count: number };
}

export interface OnboardingStatus {
  ready: boolean;
  current_step: OnboardingStep | 'completed';
  completed: boolean;
  completion_percentage: number;
  details: OnboardingStatusDetails;
  timestamp: string;
}

// ============================================================================
// INTENT TYPES
// ============================================================================

/**
 * Intent type discriminator
 */
export type IntentType = 'dev' | 'doc';

/**
 * Intent execution phase
 */
export type IntentPhase = 'briefing' | 'questions' | 'execution' | 'refinement';

/**
 * Intent lifecycle status
 */
export type IntentStatus = 'draft' | 'active' | 'locked' | 'completed' | 'archived';

/**
 * Base Intent entity (discriminated union by type)
 * 
 * @example
 * ```typescript
 * const intent: Intent = {
 *   id: 'intent-dev-123',
 *   type: 'dev',
 *   name: 'Add user authentication',
 *   slug: 'add-user-auth-123',
 *   status: 'active',
 *   phase: 'execution',
 *   locked: false,
 *   initial_files: ['src/auth/login.ts', 'src/auth/signup.ts'],
 *   created_at: '2025-01-20T14:00:00Z',
 *   updated_at: '2025-01-20T14:30:00Z'
 * }
 * ```
 */
export interface Intent {
  /** Unique intent identifier (intent-{type}-{id}) */
  id: string;
  /** Intent type discriminator */
  type: IntentType;
  /** Human-readable name */
  name: string;
  /** URL-safe slug */
  slug: string;
  /** Current lifecycle status */
  status: IntentStatus;
  /** Current execution phase */
  phase: IntentPhase;
  /** Whether intent is locked for editing */
  locked: boolean;
  /** User/process that locked the intent */
  locked_by?: string;
  /** ISO 8601 lock timestamp */
  locked_at?: string;
  /** Initial context files */
  initial_files: string[];
  /** ISO 8601 creation timestamp */
  created_at: string;
  /** ISO 8601 last update timestamp */
  updated_at: string;
}

/**
 * Development Intent (type='dev')
 * Stored in .dev_state.json
 * 
 * @example
 * ```typescript
 * const devIntent: IntentDev = {
 *   id: 'intent-dev-123',
 *   type: 'dev',
 *   name: 'Add JWT auth',
 *   slug: 'add-jwt-auth-123',
 *   status: 'active',
 *   phase: 'execution',
 *   locked: false,
 *   initial_files: ['src/auth/jwt.ts'],
 *   created_at: '2025-01-20T14:00:00Z',
 *   updated_at: '2025-01-20T14:30:00Z',
 *   briefing: {
 *     problem: 'Users cannot securely authenticate',
 *     expected_output: 'JWT-based auth system',
 *     constraints: ['Must use RS256', 'Token expiry: 1h'],
 *     acceptance_criteria: ['Login returns valid JWT', 'Protected routes verify token']
 *   },
 *   questions: [
 *     { id: 'q1', text: 'Should we support refresh tokens?', answer: 'Yes', answered_at: '2025-01-20T14:10:00Z' }
 *   ],
 *   turns: [],
 *   context_plan: {
 *     strategy: 'focused',
 *     files_included: ['src/auth/jwt.ts', 'src/middleware/auth.ts'],
 *     token_estimate: 2500,
 *     generated_at: '2025-01-20T14:15:00Z'
 *   }
 * }
 * ```
 */
export interface IntentDev extends Intent {
  type: 'dev';
  /** Problem definition and expected output */
  briefing?: Briefing;
  /** Clarification questions and answers */
  questions?: Question[];
  /** Conversation turns with AI */
  turns: Turn[];
  /** Context inclusion strategy */
  context_plan?: ContextPlan;
}

/**
 * Documentation Intent (type='doc')
 * 
 * @example
 * ```typescript
 * const docIntent: IntentDoc = {
 *   id: 'intent-doc-456',
 *   type: 'doc',
 *   name: 'API documentation',
 *   slug: 'api-docs-456',
 *   status: 'active',
 *   phase: 'execution',
 *   locked: false,
 *   initial_files: ['src/api/**\/*.ts'],
 *   created_at: '2025-01-21T09:00:00Z',
 *   updated_at: '2025-01-21T09:30:00Z',
 *   context: {
 *     files_to_document: ['src/api/users.ts', 'src/api/auth.ts'],
 *     output_format: 'markdown',
 *     include_examples: true
 *   },
 *   turns: []
 * }
 * ```
 */
export interface IntentDoc extends Intent {
  type: 'doc';
  /** Documentation context */
  context?: DocContext;
  /** Conversation turns with AI */
  turns: Turn[];
}

/**
 * Intent briefing (DEV only)
 */
export interface Briefing {
  /** Problem description */
  problem: string;
  /** Expected output/solution */
  expected_output: string;
  /** Technical constraints */
  constraints?: string[];
  /** Success criteria */
  acceptance_criteria?: string[];
}

/**
 * Clarification question in briefing phase
 */
export interface Question {
  /** Unique question identifier */
  id: string;
  /** Question text */
  text: string;
  /** User's answer */
  answer?: string;
  /** ISO 8601 answer timestamp */
  answered_at?: string;
}

/**
 * Conversation turn (user or AI message)
 */
export interface Turn {
  /** Unique turn identifier */
  id: string;
  /** Message sender */
  actor: 'user' | 'ai';
  /** Message content */
  content: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** AI provider used (for AI turns) */
  provider?: AIProvider['id'];
  /** Additional metadata (e.g., model used, tokens) */
  metadata?: Record<string, unknown>;
}

/**
 * Context inclusion plan for AI execution
 */
export interface ContextPlan {
  /** Strategy used (focused, broad, full) */
  strategy: string;
  /** Files included in context */
  files_included: string[];
  /** Estimated token count */
  token_estimate: number;
  /** ISO 8601 generation timestamp */
  generated_at: string;
}

/**
 * Documentation context (DOC intents)
 */
export interface DocContext {
  /** Files to document */
  files_to_document?: string[];
  /** Output format (markdown, html, pdf) */
  output_format?: string;
  /** Include code examples */
  include_examples?: boolean;
  /** Additional options */
  [key: string]: unknown;
}

// ============================================================================
// PROJECT TYPES
// ============================================================================

/**
 * Project detected by Brain scanner
 * 
 * @example
 * ```typescript
 * const detected: DetectedProject = {
 *   path: '/Users/dev/projects/my-app',
 *   name: 'my-app',
 *   strategy: 'nodejs',
 *   confidence: 'high',
 *   indicators_found: ['package.json', 'tsconfig.json', 'src/']
 * }
 * ```
 */
export interface DetectedProject {
  /** Absolute project path */
  path: string;
  /** Project name (inferred from path) */
  name: string;
  /** Detected project type/strategy */
  strategy: string;
  /** Detection confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** Files/patterns that triggered detection */
  indicators_found: string[];
}

/**
 * Project linked to Nucleus
 * 
 * @example
 * ```typescript
 * const linked: LinkedProject = {
 *   name: 'my-app',
 *   path: '/Users/dev/projects/my-app',
 *   strategy: 'nodejs',
 *   nucleus_path: '/Users/dev/bloom/acme-nucleus',
 *   repo_url: 'https://github.com/acme/my-app',
 *   description: 'Main web application',
 *   linked_at: '2025-01-15T11:00:00Z'
 * }
 * ```
 */
export interface LinkedProject {
  /** Project name */
  name: string;
  /** Absolute project path */
  path: string;
  /** Project strategy (nodejs, python, etc.) */
  strategy: string;
  /** Parent nucleus path */
  nucleus_path: string;
  /** GitHub repository URL (optional) */
  repo_url?: string;
  /** Human description */
  description?: string;
  /** ISO 8601 link timestamp */
  linked_at: string;
}

// ============================================================================
// PROFILE TYPES
// ============================================================================

/**
 * Chrome profile with AI accounts
 * 
 * @example
 * ```typescript
 * const profile: ChromeProfile = {
 *   id: 'profile-default',
 *   name: 'Default',
 *   path: '/Users/dev/Library/Application Support/Google/Chrome/Default',
 *   ai_accounts: [
 *     {
 *       provider: 'google',
 *       account_id: 'user@gmail.com',
 *       status: 'active',
 *       usage_remaining: 500,
 *       quota: 1000,
 *       last_checked: '2025-01-23T10:00:00Z'
 *     }
 *   ]
 * }
 * ```
 */
export interface ChromeProfile {
  /** Unique profile identifier */
  id: string;
  /** Profile display name */
  name: string;
  /** Absolute profile directory path */
  path: string;
  /** Linked AI service accounts */
  ai_accounts: AIAccount[];
}

/**
 * AI service account with usage tracking
 */
export interface AIAccount {
  /** AI service provider */
  provider: 'google' | 'openai' | 'anthropic' | 'github';
  /** Account identifier (email, username, etc.) */
  account_id: string;
  /** Current account status */
  status: 'active' | 'inactive' | 'quota_exceeded' | 'error';
  /** Remaining API calls/tokens */
  usage_remaining?: number;
  /** Total quota limit */
  quota?: number;
  /** ISO 8601 last check timestamp */
  last_checked: string;
  /** Error message if status is 'error' */
  error?: string;
}

// ============================================================================
// GITHUB TYPES
// ============================================================================

/**
 * GitHub authentication status
 * 
 * @example
 * ```typescript
 * const auth: GitHubAuthStatus = {
 *   authenticated: true,
 *   user: {
 *     login: 'johndoe',
 *     id: 12345,
 *     name: 'John Doe',
 *     email: 'john@example.com',
 *     avatar_url: 'https://avatars.githubusercontent.com/u/12345'
 *   },
 *   organizations: [
 *     { id: 67890, login: 'acme-corp', avatar_url: '...', description: 'ACME Corporation' }
 *   ]
 * }
 * ```
 */
export interface GitHubAuthStatus {
  /** Whether user is authenticated */
  authenticated: boolean;
  /** GitHub user info (if authenticated) */
  user?: {
    login: string;
    id: number;
    name?: string;
    email?: string;
    avatar_url?: string;
  };
  /** User's organizations */
  organizations?: GitHubOrganization[];
}

/**
 * GitHub repository metadata
 */
export interface GitHubRepository {
  /** GitHub repository ID */
  id: number;
  /** Repository name */
  name: string;
  /** Full name (owner/repo) */
  full_name: string;
  /** Repository description */
  description?: string;
  /** HTTPS clone URL */
  clone_url: string;
  /** Web URL */
  html_url: string;
  /** Whether repo is private */
  private: boolean;
  /** Primary language */
  language?: string;
  /** Star count */
  stars: number;
  /** ISO 8601 last update timestamp */
  updated_at: string;
}

/**
 * GitHub organization metadata
 */
export interface GitHubOrganization {
  /** GitHub organization ID */
  id: number;
  /** Organization login/username */
  login: string;
  /** Avatar image URL */
  avatar_url: string;
  /** Organization description */
  description?: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Standard error codes for the entire system
 */
export type ErrorCode =
  | 'BRAIN_CLI_UNAVAILABLE'
  | 'BRAIN_EXECUTION_FAILED'
  | 'NOT_AUTHENTICATED'
  | 'NOT_NUCLEUS'
  | 'AUTH_FAILED'
  | 'NUCLEUS_NOT_FOUND'
  | 'INTENT_NOT_FOUND'
  | 'INTENT_LOCKED'
  | 'INTENT_LOCKED_BY_OTHER'
  | 'PROJECT_NOT_FOUND'
  | 'PROFILE_NOT_FOUND'
  | 'AI_RATE_LIMIT'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_AUTH_FAILED'
  | 'AI_TIMEOUT'
  | 'RATE_LIMIT_EXCEEDED'
  | 'AI_EXECUTION_PROMPT_INVALID'
  | 'AI_EXECUTION_CONTEXT_UNKNOWN'
  | 'AI_EXECUTION_STREAM_ERROR'
  | 'AI_EXECUTION_PROCESS_NOT_FOUND'
  | 'AI_EXECUTION_CANCELLED'
  | 'AI_EXECUTION_OLLAMA_NOT_RUNNING'
  | 'AI_EXECUTION_OLLAMA_MODEL_MISSING'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR';

/**
 * Standard error response structure
 * 
 * @example
 * ```typescript
 * const error: ErrorResponse = {
 *   error: 'INTENT_LOCKED',
 *   error_code: 'INTENT_LOCKED',
 *   message: 'Intent is currently locked by another process',
 *   details: { locked_by: 'ai-executor-123', locked_at: '2025-01-23T10:00:00Z' },
 *   recoverable: true,
 *   retry_after: 5000,
 *   timestamp: '2025-01-23T10:05:00Z'
 * }
 * ```
 */
export interface ErrorResponse {
  /** Error identifier (same as error_code for compatibility) */
  error: string;
  /** Standard error code */
  error_code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error context */
  details?: Record<string, unknown>;
  /** Whether error can be recovered from */
  recoverable: boolean;
  /** Milliseconds to wait before retry (if applicable) */
  retry_after?: number;
  /** ISO 8601 error timestamp */
  timestamp: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Successful API response wrapper
 * 
 * @example
 * ```typescript
 * const response: APISuccessResponse<Nucleus> = {
 *   ok: true,
 *   data: { id: '123', organization: 'acme', ... },
 *   timestamp: '2025-01-23T10:00:00Z'
 * }
 * ```
 */
export interface APISuccessResponse<T> {
  /** Success indicator */
  ok: true;
  /** Typed response data */
  data: T;
  /** ISO 8601 response timestamp */
  timestamp: string;
}

/**
 * Error API response wrapper
 * 
 * @example
 * ```typescript
 * const response: APIErrorResponse = {
 *   ok: false,
 *   error: {
 *     error: 'NUCLEUS_NOT_FOUND',
 *     error_code: 'NUCLEUS_NOT_FOUND',
 *     message: 'Nucleus not found at path /invalid/path',
 *     recoverable: true,
 *     timestamp: '2025-01-23T10:00:00Z'
 *   }
 * }
 * ```
 */
export interface APIErrorResponse {
  /** Error indicator */
  ok: false;
  /** Error details */
  error: ErrorResponse;
}

/**
 * Discriminated union of API responses
 * Use type narrowing with `response.ok` to access data or error
 */
export type APIResponse<T> = APISuccessResponse<T> | APIErrorResponse;