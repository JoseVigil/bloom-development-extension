import type { FastifyPluginAsync } from 'fastify';
import { BrainApiAdapter } from '../adapters/BrainApiAdapter';
import { profileSchemas } from '../schemas/profile.schema';
import type { ChromeProfile } from '../../../contracts/types';
import { createErrorResponse } from '../../../contracts/errors';

/**
 * Profile Routes - Chrome profile and AI account management
 * Preserves legacy PluginApiServer profile handlers
 */
export const profileRoutes: FastifyPluginAsync = async (fastify) => {
  
  // GET /api/v1/profile/list
  fastify.get('/list', {
    schema: profileSchemas.list
  }, async (request, reply) => {
    
    const result = await BrainApiAdapter.profileList();
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          result.error || 'Failed to list profiles'
        ),
        timestamp: new Date().toISOString()
      });
    }

    return {
      ok: true,
      data: {
        profiles: result.data?.profiles || []
      },
      timestamp: new Date().toISOString()
    };
  });

  // GET /api/v1/profile/:id
  fastify.get('/:id', {
    schema: profileSchemas.get
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    // Get all profiles and filter
    const result = await BrainApiAdapter.profileList();
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse('BRAIN_EXECUTION_FAILED', 'Failed to get profile'),
        timestamp: new Date().toISOString()
      });
    }

    const profile = result.data?.profiles?.find((p: ChromeProfile) => p.id === id);
    
    if (!profile) {
      return reply.code(404).send({
        ok: false,
        error: createErrorResponse('PROFILE_NOT_FOUND', `Profile ${id} not found`),
        timestamp: new Date().toISOString()
      });
    }

    return {
      ok: true,
      data: profile,
      timestamp: new Date().toISOString()
    };
  });

  // POST /api/v1/profile/:id/refresh-accounts
  fastify.post('/:id/refresh-accounts', {
    schema: profileSchemas.refreshAccounts
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const result = await BrainApiAdapter.profileRefreshAccounts(id);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          result.error || 'Failed to refresh accounts'
        ),
        timestamp: new Date().toISOString()
      });
    }

    // Broadcast WebSocket update
    const deps = (fastify as any).deps;
    deps.wsManager?.broadcast('profile:update', {
      profileId: id,
      aiAccounts: result.data?.accounts || [],
      timestamp: Date.now()
    });

    return {
      ok: true,
      data: {
        accounts: result.data?.accounts || []
      },
      timestamp: new Date().toISOString()
    };
  });

  // POST /api/v1/profile/create
  fastify.post('/create', {
    schema: profileSchemas.create
  }, async (request, reply) => {
    const { alias } = request.body as { alias: string };
    
    const result = await BrainApiAdapter.profileCreate(alias);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          result.error || 'Failed to create profile'
        ),
        timestamp: new Date().toISOString()
      });
    }

    return reply.code(201).send({
      ok: true,
      data: result.data as ChromeProfile,
      timestamp: new Date().toISOString()
    });
  });

  // DELETE /api/v1/profile/:id
  fastify.delete('/:id', {
    schema: profileSchemas.destroy
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { force } = request.query as { force?: boolean };
    
    const result = await BrainApiAdapter.profileDestroy(id, force);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          result.error || 'Failed to destroy profile'
        ),
        timestamp: new Date().toISOString()
      });
    }

    return {
      ok: true,
      timestamp: new Date().toISOString()
    };
  });

  // POST /api/v1/profile/:id/accounts/register
  fastify.post('/:id/accounts/register', {
    schema: profileSchemas.registerAccount
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { provider, email } = request.body as { provider: string; email: string };
    
    const result = await BrainApiAdapter.profileAccountsRegister(id, provider, email);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          result.error || 'Failed to register account'
        ),
        timestamp: new Date().toISOString()
      });
    }

    return {
      ok: true,
      timestamp: new Date().toISOString()
    };
  });
};