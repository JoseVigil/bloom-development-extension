/**
 * Health check routes for Bloom Nucleus stack verification.
 * Exposes Brain CLI health commands via HTTP REST API.
 * 
 * @module health.routes
 */

import { FastifyPluginAsync } from 'fastify';
import { BrainApiAdapter } from '../adapters/BrainApiAdapter';
import { BrainResult } from '../types/brain.types';

/**
 * Health routes plugin.
 * Registers all health check endpoints under /api/v1/health prefix.
 */
export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  
  /**
   * GET /api/v1/health
   * Full stack health check - verifies all Bloom Nucleus components.
   */
  fastify.get('/', {
    schema: {
      tags: ['health'],
      summary: 'Full stack health check',
      description: 'Verifies all Bloom Nucleus components (host, API, extension, Brain CLI, and onboarding)',
      response: {
        200: {
          description: 'All components healthy',
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok'] },
            details: { type: 'object' },
            overall_health_score: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' },
            checked_by: { type: 'string' }
          }
        },
        207: {
          description: 'Partial health - some components failing',
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['partial'] },
            details: { type: 'object' },
            checked_by: { type: 'string' }
          }
        },
        503: {
          description: 'Service unhealthy',
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['error'] },
            error: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result: BrainResult = await BrainApiAdapter.healthFullStack();
      
      if (result.status === 'success' && result.data) {
        // Return data directly for successful health checks
        return reply.code(200).send({
          ...result.data,
          checked_by: 'api'
        });
      } else if (result.status === 'error') {
        // Health check failed - return 503 Service Unavailable
        return reply.code(503).send({
          status: 'error',
          error: result.error || 'Health check failed',
          timestamp: new Date().toISOString()
        });
      } else {
        // Partial health - return 207 Multi-Status
        return reply.code(207).send({
          ...result.data,
          status: 'partial',
          checked_by: 'api'
        });
      }
    } catch (error) {
      fastify.log.error('Health check error:', error);
      return reply.code(500).send({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/v1/health/onboarding
   * Onboarding status check - verifies completion of onboarding steps.
   */
  fastify.get('/onboarding', {
    schema: {
      tags: ['health'],
      summary: 'Onboarding status check',
      description: 'Verifies completion of onboarding steps (GitHub, Gemini, Nucleus, Projects)',
      response: {
        200: {
          description: 'Onboarding status retrieved successfully',
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            current_step: { type: 'string' },
            completed: { type: 'boolean' },
            details: { type: 'object' },
            completion_percentage: { type: 'number' }
          }
        },
        500: {
          description: 'Failed to check onboarding status',
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['error'] },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result: BrainResult = await BrainApiAdapter.healthOnboardingStatus();
      
      if (result.status === 'success' && result.data) {
        return reply.code(200).send(result.data);
      } else {
        return reply.code(500).send({
          status: 'error',
          error: result.error || 'Failed to check onboarding status'
        });
      }
    } catch (error) {
      fastify.log.error('Onboarding status check error:', error);
      return reply.code(500).send({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/v1/health/websocket
   * WebSocket connectivity check - verifies WS server on port 4124.
   */
  fastify.get('/websocket', {
    schema: {
      tags: ['health'],
      summary: 'WebSocket connectivity check',
      description: 'Verifies WebSocket server status on port 4124',
      response: {
        200: {
          description: 'WebSocket connected',
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['connected'] },
            uptime_seconds: { type: 'number' },
            details: { type: 'object' }
          }
        },
        503: {
          description: 'WebSocket disconnected',
          type: 'object',
          properties: {
            status: { type: 'string' },
            details: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result: BrainResult = await BrainApiAdapter.healthWebSocketStatus();
      
      if (result.status === 'success' && result.data) {
        // Determine HTTP status based on WebSocket status
        const wsStatus = result.data.status;
        const httpStatus = wsStatus === 'connected' ? 200 : 503;
        
        return reply.code(httpStatus).send(result.data);
      } else {
        return reply.code(500).send({
          status: 'error',
          error: result.error || 'Failed to check WebSocket status'
        });
      }
    } catch (error) {
      fastify.log.error('WebSocket status check error:', error);
      return reply.code(500).send({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/v1/health/components
   * Alias for full-stack health check (legacy compatibility).
   * 
   * @deprecated Use /api/v1/health instead
   */
  fastify.get('/components', {
    schema: {
      tags: ['health'],
      summary: 'Legacy components health check',
      description: 'Alias for full-stack health check (use /api/v1/health instead)',
      deprecated: true,
      response: {
        200: {
          description: 'Redirected to main health endpoint',
          type: 'object'
        }
      }
    }
  }, async (request, reply) => {
    // Internal redirect to main health endpoint
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/v1/health'
    });
    
    return reply
      .code(response.statusCode)
      .headers(response.headers)
      .send(response.json());
  });
};