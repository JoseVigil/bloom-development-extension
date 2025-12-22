import { z } from 'zod';

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const BrainStatusSchema = z.enum(['success', 'error', 'not_authenticated', 'not_nucleus']);

export const BaseBrainResultSchema = z.object({
  status: BrainStatusSchema,
  operation: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional()
});

// ============================================================================
// NUCLEUS SCHEMAS
// ============================================================================

export const NucleusProjectSchema = z.object({
  name: z.string(),
  path: z.string(),
  strategy: z.string(),
  active: z.boolean(),
  repo_url: z.string().optional()
});

export const NucleusDataSchema = z.object({
  id: z.string(),
  organization: z.object({
    name: z.string(),
    url: z.string().optional()
  }),
  path: z.string(),
  projects_count: z.number(),
  projects: z.array(NucleusProjectSchema),
  created_at: z.string()
});

export const NucleusListResultSchema = BaseBrainResultSchema.extend({
  data: z.object({
    nuclei: z.array(NucleusDataSchema)
  }).optional()
});

export const NucleusGetResultSchema = BaseBrainResultSchema.extend({
  data: NucleusDataSchema.optional()
});

export const NucleusCreateResultSchema = BaseBrainResultSchema.extend({
  data: z.object({
    id: z.string(),
    path: z.string(),
    created_at: z.string()
  }).optional()
});

// ============================================================================
// INTENT SCHEMAS
// ============================================================================

export const IntentPhaseSchema = z.enum(['briefing', 'execution', 'refinement']);
export const IntentStatusSchema = z.enum(['active', 'locked', 'completed', 'cancelled']);
export const IntentTypeSchema = z.enum(['dev', 'doc']);

export const DevStateSchema = z.object({
  id: z.string(),
  type: z.literal('dev'),
  name: z.string(),
  phase: IntentPhaseSchema,
  status: IntentStatusSchema,
  locked: z.boolean(),
  locked_by: z.string().nullable(),
  locked_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  initial_files: z.array(z.string()),
  current_turn: z.number()
});

export const DocStateSchema = z.object({
  id: z.string(),
  type: z.literal('doc'),
  name: z.string(),
  phase: z.enum(['context', 'curation']),
  status: IntentStatusSchema,
  locked: z.boolean(),
  locked_by: z.string().nullable(),
  locked_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  initial_files: z.array(z.string()),
  current_turn: z.number()
});

export const IntentStateSchema = z.union([DevStateSchema, DocStateSchema]);

export const BriefingSchema = z.object({
  problem: z.string(),
  expected_output: z.string(),
  constraints: z.array(z.string()).optional(),
  files: z.array(z.string())
});

export const TurnSchema = z.object({
  turn_id: z.number(),
  actor: z.enum(['user', 'ai']),
  content: z.string(),
  timestamp: z.string(),
  files_modified: z.array(z.string()).optional()
});

export const IntentListItemSchema = z.object({
  id: z.string(),
  type: IntentTypeSchema,
  name: z.string(),
  status: IntentStatusSchema,
  locked: z.boolean(),
  locked_by: z.string().nullable(),
  created_at: z.string()
});

export const IntentListResultSchema = BaseBrainResultSchema.extend({
  data: z.object({
    intents: z.array(IntentListItemSchema)
  }).optional()
});

export const IntentGetResultSchema = BaseBrainResultSchema.extend({
  data: z.object({
    state: IntentStateSchema,
    briefing: BriefingSchema.optional(),
    answers: z.record(z.string(), z.string()).optional(),
    turns: z.array(TurnSchema).optional()
  }).optional()
});

export const IntentCreateResultSchema = BaseBrainResultSchema.extend({
  data: z.object({
    id: z.string(),
    folder: z.string(),
    path: z.string()
  }).optional()
});

export const IntentLockResultSchema = BaseBrainResultSchema.extend({
  data: z.object({
    locked: z.boolean(),
    by: z.string(),
    at: z.string()
  }).optional()
});

export const IntentFinalizeResultSchema = BaseBrainResultSchema.extend({
  data: z.object({
    success: z.boolean(),
    files_modified: z.array(z.string())
  }).optional()
});

// ============================================================================
// PROFILE SCHEMAS
// ============================================================================

export const AiAccountSchema = z.object({
  provider: z.string(),
  email: z.string(),
  status: z.enum(['active', 'inactive', 'quota_exceeded']),
  quota: z.number().optional(),
  usage_remaining: z.number().optional()
});

export const ProfileSchema = z.object({
  id: z.string(),
  alias: z.string(),
  email: z.string().optional(),
  accounts: z.array(AiAccountSchema)
});

export const ProfileListResultSchema = BaseBrainResultSchema.extend({
  data: z.object({
    profiles: z.array(ProfileSchema)
  }).optional()
});

// ============================================================================
// PROJECT SCHEMAS
// ============================================================================

export const DetectedProjectSchema = z.object({
  path: z.string(),
  name: z.string(),
  strategy: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  indicators_found: z.array(z.string())
});

export const ProjectDetectResultSchema = BaseBrainResultSchema.extend({
  data: z.object({
    parent_path: z.string(),
    projects_found: z.number(),
    projects: z.array(DetectedProjectSchema)
  }).optional()
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type BrainStatus = z.infer<typeof BrainStatusSchema>;
export type NucleusData = z.infer<typeof NucleusDataSchema>;
export type DevState = z.infer<typeof DevStateSchema>;
export type DocState = z.infer<typeof DocStateSchema>;
export type IntentState = z.infer<typeof IntentStateSchema>;
export type Briefing = z.infer<typeof BriefingSchema>;
export type Turn = z.infer<typeof TurnSchema>;
export type IntentListItem = z.infer<typeof IntentListItemSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type AiAccount = z.infer<typeof AiAccountSchema>;
export type DetectedProject = z.infer<typeof DetectedProjectSchema>;