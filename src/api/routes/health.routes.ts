/**
 * Health check routes for Brain integration and onboarding status
 */

import type { FastifyPluginAsync } from 'fastify';
import type { BrainResult } from '../types/brain.types';
import { BrainApiAdapter } from '../adapters/BrainApiAdapter';

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

const onboardingStatusResponseSchema = {
  type: 'object',
  required: ['completed', 'steps', 'timestamp'],
  properties: {
    completed: { type: 'boolean' },
    steps: {
      type: 'object',
      properties: {
        github_auth: { type: 'boolean' },
        gemini_setup: { type: 'boolean' },
        nucleus_created: { type: 'boolean' },
        projects_linked: { type: 'boolean' }
      }
    },
    nucleus_path: { type: 'string' },
    organization: { type: 'string' },
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
        // Check Brain CLI availability
        const authResult = await BrainApiAdapter.githubAuthStatus();
        
        const brainAvailable = authResult.status !== 'error';
        const authenticated = authResult.status === 'success' && 
          (authResult.data as Record<string, any>)?.authenticated === true;

        // Check if we're in a nucleus
        let isNucleus = false;
        let nucleusData = undefined;

        if (brainAvailable) {
          try {
            // Use healthFullStack to check nucleus status
            const healthResult = await BrainApiAdapter.healthFullStack();
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
          } catch {
            // Not in a nucleus, which is fine
            isNucleus = false;
          }
        }

        return reply.code(200).send({
          ok: brainAvailable,
          brain_available: brainAvailable,
          authenticated,
          is_nucleus: isNucleus,
          ...(nucleusData && { nucleus: nucleusData }),
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        fastify.log.error({ err: error }, 'Health check error');
        
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
   * Get onboarding progress status
   */
  fastify.get(
    '/health/onboarding',
    {
      schema: {
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
        // Get nucleus info which includes onboarding state
        const result = await BrainApiAdapter.healthOnboardingStatus();

        if (result.status === 'success' && result.data) {
          const data = result.data as Record<string, any>;
          const onboarding = data.onboarding as Record<string, any> || {};
          const steps = onboarding.steps as Record<string, boolean> || {};

          return reply.code(200).send({
            completed: onboarding.completed === true,
            steps: {
              github_auth: steps.github_auth === true,
              gemini_setup: steps.gemini_setup === true,
              nucleus_created: steps.nucleus_created === true,
              projects_linked: steps.projects_linked === true
            },
            nucleus_path: data.path as string || undefined,
            organization: data.organization as string || undefined,
            timestamp: new Date().toISOString()
          });
        }

        // Not in a nucleus or no onboarding data
        return reply.code(200).send({
          completed: false,
          steps: {
            github_auth: false,
            gemini_setup: false,
            nucleus_created: false,
            projects_linked: false
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        fastify.log.error({ err: error }, 'Onboarding check error');
        
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