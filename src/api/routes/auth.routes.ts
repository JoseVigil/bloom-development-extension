// src/api/routes/auth.routes.ts
// FINAL FIX: All TypeScript errors resolved

import type { FastifyPluginAsync } from 'fastify';
import { BrainApiAdapter } from '../adapters/BrainApiAdapter';
import { authSchemas } from '../schemas/auth.schema';
import type { GitHubAuthStatus } from '../../../contracts/types';
import { createErrorResponse } from '../../../contracts/errors';

/**
 * Auth Routes - GitHub and Gemini authentication
 * Enhanced with OAuth flow support via Brain Profile
 */
export const authRoutes: FastifyPluginAsync = async (fastify) => {
  
  // GET /api/v1/auth/github/start - Start OAuth flow with Brain Profile
  fastify.get('/github/start', {
    schema: {
      description: 'Start GitHub OAuth flow using Brain Profile Master',
      tags: ['auth'],
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            message: { type: 'string' },
            timestamp: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            error: { type: 'string' },
            timestamp: { type: 'string' }
          }
        },
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
  }, async (request, reply) => {
    const deps = (fastify as any).deps;
    
    if (!deps.githubOAuthServer) {
      return reply.code(503).send({
        ok: false,
        error: 'OAuth server not initialized. Please check server configuration.',
        timestamp: new Date().toISOString()
      });
    }
    
    try {
      await deps.githubOAuthServer.startOAuthFlow();
      
      fastify.log.info('GitHub OAuth flow started successfully');
      
      return {
        ok: true,
        message: 'OAuth flow started - check Chrome window for authorization',
        timestamp: new Date().toISOString()
      };
      
    } catch (error: any) {
      fastify.log.error('Failed to start GitHub OAuth flow:', error);
      
      return reply.code(500).send({
        ok: false,
        error: error.message || 'Failed to start OAuth flow',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // GET /api/v1/auth/status
  fastify.get('/status', {
    schema: authSchemas.status
  }, async (request, reply) => {
    
    try {
      const githubResult = await BrainApiAdapter.githubAuthStatus();
      const geminiResult = await BrainApiAdapter.geminiKeysList();
      
      const githubAuthenticated = githubResult.status === 'success' && 
                                   githubResult.data?.authenticated === true;
      
      const geminiConfigured = geminiResult.status === 'success' && 
                               Array.isArray(geminiResult.data?.keys) && 
                               geminiResult.data.keys.length > 0;

      return {
        ok: true,
        data: {
          githubAuthenticated,
          geminiConfigured,
          githubUsername: githubResult.data?.user?.login || null,
          allOrgs: githubResult.data?.organizations?.map((org: any) => org.login) || []
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      fastify.log.warn({ msg: 'Auth status check failed', error: error.message });
      
      return {
        ok: true,
        data: {
          githubAuthenticated: false,
          geminiConfigured: false,
          githubUsername: null,
          allOrgs: []
        },
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  });

  // GET /api/v1/auth/github/status
  fastify.get('/github/status', {
    schema: authSchemas.githubStatus
  }, async (request, reply) => {
    
    try {
      const result = await BrainApiAdapter.githubAuthStatus();
      
      // ✅ Handle not_authenticated as valid response
      if (result.status === 'not_authenticated') {
        const emptyStatus: GitHubAuthStatus = {
          authenticated: false,
          organizations: []
        };
        
        return {
          ok: true,
          data: emptyStatus,
          timestamp: new Date().toISOString()
        };
      }
      
      if (result.status !== 'success') {
        fastify.log.warn({
          msg: 'GitHub auth status failed',
          status: result.status,
          error: result.error
        });
        
        const emptyStatus: GitHubAuthStatus = {
          authenticated: false,
          organizations: []
        };
        
        return {
          ok: true,
          data: emptyStatus,
          timestamp: new Date().toISOString()
        };
      }

      return {
        ok: true,
        data: result.data as GitHubAuthStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      fastify.log.error('GitHub status check error:', error);
      
      const emptyStatus: GitHubAuthStatus = {
        authenticated: false,
        organizations: []
      };
      
      return {
        ok: true,
        data: emptyStatus,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  });

  // POST /api/v1/auth/github/login
  fastify.post('/github/login', {
    schema: authSchemas.githubLogin
  }, async (request, reply) => {
    const { token } = request.body as { token: string };
    
    try {
      const result = await BrainApiAdapter.githubAuthLogin(token);
      
      if (result.status !== 'success') {
        return reply.code(401).send({
          ok: false,
          error: createErrorResponse(
            'AUTH_FAILED',
            result.error || 'GitHub authentication failed'
          ),
          timestamp: new Date().toISOString()
        });
      }

      const deps = (fastify as any).deps;
      deps.wsManager?.broadcast('auth:updated', {
        githubAuthenticated: true,
        username: result.data?.user?.login,
        allOrgs: result.data?.organizations?.map((org: any) => org.login) || []
      });

      return {
        ok: true,
        data: result.data as GitHubAuthStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      fastify.log.error('GitHub login error:', error);
      
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'AUTH_FAILED',
          error.message || 'GitHub authentication failed'
        ),
        timestamp: new Date().toISOString()
      });
    }
  });

  // POST /api/v1/auth/github/logout
  fastify.post('/github/logout', {
    schema: authSchemas.githubLogout
  }, async (request, reply) => {
    
    try {
      const result = await BrainApiAdapter.githubAuthLogout();
      
      if (result.status !== 'success') {
        return reply.code(500).send({
          ok: false,
          error: createErrorResponse(
            'BRAIN_EXECUTION_FAILED',
            result.error || 'Failed to logout from GitHub'
          ),
          timestamp: new Date().toISOString()
        });
      }

      const deps = (fastify as any).deps;
      deps.wsManager?.broadcast('auth:updated', {
        githubAuthenticated: false
      });

      return {
        ok: true,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      fastify.log.error('GitHub logout error:', error);
      
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          error.message || 'Failed to logout from GitHub'
        ),
        timestamp: new Date().toISOString()
      });
    }
  });

  // GET /api/v1/auth/github/orgs
  fastify.get('/github/orgs', {
    schema: authSchemas.githubOrgs
  }, async (request, reply) => {
    
    try {
      const result = await BrainApiAdapter.githubOrgsList();
      
      if (result.status !== 'success') {
        return reply.code(500).send({
          ok: false,
          error: createErrorResponse(
            'BRAIN_EXECUTION_FAILED',
            result.error || 'Failed to list GitHub organizations'
          ),
          timestamp: new Date().toISOString()
        });
      }

      return {
        ok: true,
        data: {
          organizations: result.data?.organizations || []
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      fastify.log.error('GitHub orgs list error:', error);
      
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          error.message || 'Failed to list GitHub organizations'
        ),
        timestamp: new Date().toISOString()
      });
    }
  });

  // GET /api/v1/auth/github/repos
  fastify.get('/github/repos', {
    schema: authSchemas.githubRepos
  }, async (request, reply) => {
    const { org } = request.query as { org?: string };
    
    try {
      const result = await BrainApiAdapter.githubReposList(org);
      
      if (result.status !== 'success') {
        return reply.code(500).send({
          ok: false,
          error: createErrorResponse(
            'BRAIN_EXECUTION_FAILED',
            result.error || 'Failed to list GitHub repositories'
          ),
          timestamp: new Date().toISOString()
        });
      }

      return {
        ok: true,
        data: {
          repositories: result.data?.repositories || []
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      fastify.log.error('GitHub repos list error:', error);
      
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          error.message || 'Failed to list GitHub repositories'
        ),
        timestamp: new Date().toISOString()
      });
    }
  });

  // POST /api/v1/auth/gemini/add-key
  fastify.post('/gemini/add-key', {
    schema: authSchemas.geminiAddKey
  }, async (request, reply) => {
    const { profile, key, priority } = request.body as { 
      profile: string; 
      key: string; 
      priority?: number 
    };
    
    try {
      const result = await BrainApiAdapter.geminiKeysAdd(profile, key, priority);
      
      if (result.status !== 'success') {
        return reply.code(500).send({
          ok: false,
          error: createErrorResponse(
            'BRAIN_EXECUTION_FAILED',
            result.error || 'Failed to add Gemini API key'
          ),
          timestamp: new Date().toISOString()
        });
      }

      const deps = (fastify as any).deps;
      deps.wsManager?.broadcast('auth:updated', {
        geminiConfigured: true
      });

      return {
        ok: true,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      fastify.log.error('Gemini add key error:', error);
      
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          error.message || 'Failed to add Gemini API key'
        ),
        timestamp: new Date().toISOString()
      });
    }
  });

  // GET /api/v1/auth/gemini/keys
  fastify.get('/gemini/keys', {
    schema: authSchemas.geminiKeys
  }, async (request, reply) => {
    
    try {
      const result = await BrainApiAdapter.geminiKeysList();
      
      if (result.status !== 'success') {
        return reply.code(500).send({
          ok: false,
          error: createErrorResponse(
            'BRAIN_EXECUTION_FAILED',
            result.error || 'Failed to list Gemini keys'
          ),
          timestamp: new Date().toISOString()
        });
      }

      return {
        ok: true,
        data: {
          keys: result.data?.keys || []
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      fastify.log.error('Gemini keys list error:', error);
      
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          error.message || 'Failed to list Gemini keys'
        ),
        timestamp: new Date().toISOString()
      });
    }
  });

  // POST /api/v1/auth/gemini/validate
  fastify.post('/gemini/validate', {
    schema: authSchemas.geminiValidate
  }, async (request, reply) => {
    const { profile } = request.body as { profile: string };
    
    try {
      const result = await BrainApiAdapter.geminiKeysValidate(profile);
      
      if (result.status !== 'success') {
        return reply.code(500).send({
          ok: false,
          error: createErrorResponse(
            'BRAIN_EXECUTION_FAILED',
            result.error || 'Failed to validate Gemini key'
          ),
          timestamp: new Date().toISOString()
        });
      }

      return {
        ok: true,
        data: {
          valid: result.data?.valid || false
        },
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      fastify.log.error('Gemini validate error:', error);
      
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          error.message || 'Failed to validate Gemini key'
        ),
        timestamp: new Date().toISOString()
      });
    }
  });
};