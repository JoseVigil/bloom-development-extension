/**
 * Health check routes for Brain integration and onboarding status
 * 
 * FIXED:
 * - Two separate endpoints for onboarding:
 *   1. /health/onboarding → Current state (ready, current_step, details)
 *   2. /health/onboarding/steps → Wizard steps (github_auth, gemini_setup, etc.)
 * - Schemas now match actual Brain CLI output structure
 */

import type { FastifyPluginAsync } from 'fastify';
import type { BrainResult } from '../../../contracts/types';
import { BrainExecutor } from '../../utils/brainExecutor';

// ============================================================================
// SCHEMAS
// ============================================================================

const healthCheckResponseSchema = {
  type: 'object',
  required: ['ok', 'brain_available', 'authenticated', 'is_nucleus', 'timestamp'],
  properties: {
    ok: { type: 'boolean' },
    brain_available: { type: 'boolean' },
    authenticated: { type: 'boolean' },
    is_nucleus: { type: 'boolean' },
    nucleus: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        organization: { type: 'string' },
        path: { type: 'string' }
      }
    },
    timestamp: { type: 'string', format: 'date-time' }
  }
} as const;

/**
 * Schema for /health/onboarding
 * Matches Brain CLI: health onboarding-status
 */
const onboardingStatusResponseSchema = {
  type: 'object',
  required: ['ready', 'current_step', 'completed', 'details', 'timestamp'],
  properties: {
    ready: { type: 'boolean' },
    current_step: { type: 'string' },
    completed: { type: 'boolean' },
    completion_percentage: { type: 'number' },
    details: {
      type: 'object',
      required: ['github', 'gemini', 'nucleus', 'projects'],
      properties: {
        github: {
          type: 'object',
          properties: {
            authenticated: { type: 'boolean' },
            username: { type: 'string' },
            error: { type: 'string' }
          }
        },
        gemini: {
          type: 'object',
          properties: {
            configured: { type: 'boolean' },
            profile_count: { type: 'number' },
            error: { type: 'string' }
          }
        },
        nucleus: {
          type: 'object',
          properties: {
            exists: { type: 'boolean' },
            path: { type: 'string' },
            organization: { type: 'string' },
            error: { type: 'string' }
          }
        },
        projects: {
          type: 'object',
          properties: {
            added: { type: 'boolean' },
            count: { type: 'number' },
            error: { type: 'string' }
          }
        }
      }
    },
    timestamp: { type: 'string', format: 'date-time' }
  }
} as const;

/**
 * Schema for /health/onboarding/steps
 * Simplified wizard steps for UI consumption
 */
const onboardingStepsResponseSchema = {
  type: 'object',
  required: ['completed', 'steps', 'timestamp'],
  properties: {
    completed: { type: 'boolean' },
    current_step: { type: 'string' },
    completion_percentage: { type: 'number' },
    steps: {
      type: 'object',
      required: ['github_auth', 'gemini_setup', 'nucleus_created', 'projects_linked'],
      properties: {
        github_auth: { 
          type: 'object',
          required: ['completed'],
          properties: {
            completed: { type: 'boolean' },
            username: { type: 'string' },
            error: { type: 'string' }
          }
        },
        gemini_setup: { 
          type: 'object',
          required: ['completed'],
          properties: {
            completed: { type: 'boolean' },
            profile_count: { type: 'number' },
            error: { type: 'string' }
          }
        },
        nucleus_created: { 
          type: 'object',
          required: ['completed'],
          properties: {
            completed: { type: 'boolean' },
            path: { type: 'string' },
            organization: { type: 'string' },
            error: { type: 'string' }
          }
        },
        projects_linked: { 
          type: 'object',
          required: ['completed'],
          properties: {
            completed: { type: 'boolean' },
            count: { type: 'number' },
            error: { type: 'string' }
          }
        }
      }
    },
    timestamp: { type: 'string', format: 'date-time' }
  }
} as const;

// ============================================================================
// ROUTES
// ============================================================================

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /health
   * Basic health check - verifies Brain CLI availability and authentication status
   */
  fastify.get(
    '/health',
    {
      schema: {
        response: {
          200: healthCheckResponseSchema,
          503: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              error: { type: 'string' },
              timestamp: { type: 'string' }
            }
          }
        }
      }
    },
    async (_request, reply) => {
      try {
        fastify.log.info('Health check: Starting GitHub auth status check');
        
        // Check Brain CLI availability via GitHub auth
        const authResult = await BrainExecutor.githubAuthStatus();
        
        fastify.log.info({ authResult }, 'Health check: Auth result received');
        
        const brainAvailable = authResult.status !== 'error';
        const authenticated = authResult.status === 'success' && 
          (authResult.data as Record<string, any>)?.authenticated === true;

        // Check if we're in a nucleus
        let isNucleus = false;
        let nucleusData = undefined;

        if (brainAvailable) {
          try {
            fastify.log.info('Health check: Checking full stack status');
            const healthResult = await BrainExecutor.healthFullStack();
            
            fastify.log.info({ healthResult }, 'Health check: Full stack result');
            
            isNucleus = healthResult.status === 'success' && 
              (healthResult.data as Record<string, any>)?.is_nucleus === true;
            
            if (isNucleus && healthResult.data) {
              const data = healthResult.data as Record<string, any>;
              const nucleus = data.nucleus as Record<string, any>;
              if (nucleus) {
                nucleusData = {
                  id: nucleus.id || '',
                  organization: nucleus.organization || '',
                  path: nucleus.path || ''
                };
              }
            }
          } catch (error) {
            fastify.log.warn({ err: error }, 'Health check: Not in nucleus (expected)');
            isNucleus = false;
          }
        }

        const response = {
          ok: brainAvailable,
          brain_available: brainAvailable,
          authenticated,
          is_nucleus: isNucleus,
          ...(nucleusData && { nucleus: nucleusData }),
          timestamp: new Date().toISOString()
        };

        fastify.log.info({ response }, 'Health check: Complete');
        
        return reply.code(200).send(response);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        fastify.log.error({ err: error }, 'Health check: Fatal error');
        
        return reply.code(503).send({
          ok: false,
          error: errorMsg,
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /health/onboarding
   * Current onboarding state with detailed information
   * Maps to: brain health onboarding-status --json
   */
  fastify.get(
    '/health/onboarding',
    {
      schema: {
        description: 'Get detailed onboarding status (GitHub, Gemini, Nucleus, Projects)',
        tags: ['health'],
        response: {
          200: onboardingStatusResponseSchema,
          503: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              timestamp: { type: 'string' }
            }
          }
        }
      }
    },
    async (_request, reply) => {
      try {
        fastify.log.info('[Health] Checking onboarding status...');
        
        const result = await BrainExecutor.healthOnboardingStatus();

        fastify.log.info({ result }, '[Health] Raw Brain CLI result');

        if (result.status === 'success' && result.data) {
          // ✅ Brain CLI returns the correct structure directly
          const response = {
            ...result.data,
            timestamp: result.data.timestamp || new Date().toISOString()
          };

          fastify.log.info({ response }, '[Health] Onboarding Status complete');
          return reply.code(200).send(response);
        }

        // ⚠️ Fallback if Brain fails completely
        fastify.log.warn({ result }, '[Health] Brain CLI returned non-success status');
        
        return reply.code(200).send({
          ready: false,
          current_step: 'welcome',
          completed: false,
          completion_percentage: 0,
          details: {
            github: { 
              authenticated: false,
              error: result.error || result.message || 'Unknown error'
            },
            gemini: { 
              configured: false, 
              profile_count: 0,
              error: result.error || result.message || 'Unknown error'
            },
            nucleus: { 
              exists: false,
              error: result.error || result.message || 'Unknown error'
            },
            projects: { 
              added: false, 
              count: 0,
              error: result.error || result.message || 'Unknown error'
            }
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        fastify.log.error({ err: error }, '[Health] Onboarding Status failed');
        
        return reply.code(503).send({
          error: errorMsg,
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /health/onboarding/steps
   * Simplified wizard steps for UI consumption
   * Transforms the detailed status into UI-friendly step format
   */
  fastify.get(
    '/health/onboarding/steps',
    {
      schema: {
        description: 'Get wizard steps for onboarding UI',
        tags: ['health'],
        response: {
          200: onboardingStepsResponseSchema,
          503: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              timestamp: { type: 'string' }
            }
          }
        }
      }
    },
    async (_request, reply) => {
      try {
        fastify.log.info('[Health] Getting onboarding steps...');
        
        // Get the detailed status first
        const result = await BrainExecutor.healthOnboardingStatus();

        if (result.status === 'success' && result.data) {
          const data = result.data;
          
          // Transform to wizard steps format
          const response = {
            completed: data.completed || false,
            current_step: data.current_step || 'welcome',
            completion_percentage: data.completion_percentage || 0,
            steps: {
              github_auth: {
                completed: data.details?.github?.authenticated || false,
                username: data.details?.github?.username,
                error: data.details?.github?.error
              },
              gemini_setup: {
                completed: data.details?.gemini?.configured || false,
                profile_count: data.details?.gemini?.profile_count || 0,
                error: data.details?.gemini?.error
              },
              nucleus_created: {
                completed: data.details?.nucleus?.exists || false,
                path: data.details?.nucleus?.path,
                organization: data.details?.nucleus?.organization,
                error: data.details?.nucleus?.error
              },
              projects_linked: {
                completed: data.details?.projects?.added || false,
                count: data.details?.projects?.count || 0,
                error: data.details?.projects?.error
              }
            },
            timestamp: new Date().toISOString()
          };

          fastify.log.info({ response }, '[Health] Onboarding Steps complete');
          return reply.code(200).send(response);
        }

        // Fallback
        return reply.code(200).send({
          completed: false,
          current_step: 'welcome',
          completion_percentage: 0,
          steps: {
            github_auth: { completed: false },
            gemini_setup: { completed: false, profile_count: 0 },
            nucleus_created: { completed: false },
            projects_linked: { completed: false, count: 0 }
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        fastify.log.error({ err: error }, '[Health] Onboarding Steps failed');
        
        return reply.code(503).send({
          error: errorMsg,
          timestamp: new Date().toISOString()
        });
      }
    }
  );

  /**
   * GET /health/websocket
   * Check WebSocket server status
   */
  fastify.get(
    '/health/websocket',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['running', 'stopped'] },
              connections: { type: 'number' },
              timestamp: { type: 'string' }
            }
          },
          503: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              timestamp: { type: 'string' }
            }
          }
        }
      }
    },
    async (_request, reply) => {
      try {
        // Check if WebSocket server is available
        const wsServer = (fastify as any).websocketServer;
        
        if (!wsServer) {
          return reply.code(200).send({
            status: 'stopped',
            connections: 0,
            timestamp: new Date().toISOString()
          });
        }

        // Count active connections
        const connections = wsServer.clients?.size || 0;

        return reply.code(200).send({
          status: 'running',
          connections,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        fastify.log.error({ err: error }, 'WebSocket status check error');
        
        return reply.code(503).send({
          error: errorMsg,
          timestamp: new Date().toISOString()
        });
      }
    }
  );
};

export default healthRoutes;