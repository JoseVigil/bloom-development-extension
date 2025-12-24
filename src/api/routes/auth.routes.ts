// src/api/routes/auth.routes.ts (corregido con paths ajustados para asumir estructura estándar; verifica imports en tu setup)

import type { FastifyPluginAsync } from 'fastify';
import { BrainApiAdapter } from '../adapters/BrainApiAdapter';  // Ajusta si adapters no está al mismo nivel: e.g., '../../adapters/BrainApiAdapter'
import { authSchemas } from '../schemas/auth.schema';  // Ajusta si schemas no está al mismo nivel: e.g., '../../schemas/auth.schema'
import type { GitHubAuthStatus } from '@/contracts/types';
import { createErrorResponse } from '@/contracts/errors';

/**
 * Auth Routes - GitHub and Gemini authentication
 * Preserves legacy PluginApiServer auth handlers
 */
export const authRoutes: FastifyPluginAsync = async (fastify) => {
  
  // GET /api/v1/auth/status
  fastify.get('/status', {
    schema: authSchemas.status
  }, async (request, reply) => {
    
    // Get GitHub auth status
    const githubResult = await BrainApiAdapter.githubAuthStatus();
    
    // Get Gemini keys status
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
  });

  // GET /api/v1/auth/github/status
  fastify.get('/github/status', {
    schema: authSchemas.githubStatus
  }, async (request, reply) => {
    
    const result = await BrainApiAdapter.githubAuthStatus();
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          result.error || 'Failed to get GitHub auth status'
        ),
        timestamp: new Date().toISOString()
      });
    }

    return {
      ok: true,
      data: result.data as GitHubAuthStatus,
      timestamp: new Date().toISOString()
    };
  });

  // POST /api/v1/auth/github/login
  fastify.post('/github/login', {
    schema: authSchemas.githubLogin
  }, async (request, reply) => {
    const { token } = request.body as { token: string };
    
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

    // Broadcast WebSocket event
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
  });

  // POST /api/v1/auth/github/logout
  fastify.post('/github/logout', {
    schema: authSchemas.githubLogout
  }, async (request, reply) => {
    
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

    // Broadcast WebSocket event
    const deps = (fastify as any).deps;
    deps.wsManager?.broadcast('auth:updated', {
      githubAuthenticated: false
    });

    return {
      ok: true,
      timestamp: new Date().toISOString()
    };
  });

  // GET /api/v1/auth/github/orgs
  fastify.get('/github/orgs', {
    schema: authSchemas.githubOrgs
  }, async (request, reply) => {
    
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
  });

  // GET /api/v1/auth/github/repos
  fastify.get('/github/repos', {
    schema: authSchemas.githubRepos
  }, async (request, reply) => {
    const { org } = request.query as { org?: string };
    
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

    // Broadcast WebSocket event
    const deps = (fastify as any).deps;
    deps.wsManager?.broadcast('auth:updated', {
      geminiConfigured: true
    });

    return {
      ok: true,
      timestamp: new Date().toISOString()
    };
  });

  // GET /api/v1/auth/gemini/keys
  fastify.get('/gemini/keys', {
    schema: authSchemas.geminiKeys
  }, async (request, reply) => {
    
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
  });

  // POST /api/v1/auth/gemini/validate
  fastify.post('/gemini/validate', {
    schema: authSchemas.geminiValidate
  }, async (request, reply) => {
    const { profile } = request.body as { profile: string };
    
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
  });
};