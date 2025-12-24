import type { FastifyPluginAsync } from 'fastify';
import { BrainApiAdapter } from '../adapters/BrainApiAdapter';
import { intentSchemas } from '../schemas/intent.schema';
import type { Intent } from '../../../contracts/types';
import { createErrorResponse } from '../../../contracts/errors';

/**
 * Intent Routes - Full workflow support
 * Maps all legacy handlers + new workflow commands
 */
export const intentRoutes: FastifyPluginAsync = async (fastify) => {
  
  // GET /api/v1/intent/list
  fastify.get('/list', {
    schema: intentSchemas.list
  }, async (request, reply) => {
    const { nucleus, type } = request.query as { nucleus: string; type?: 'dev' | 'doc' };
    
    const result = await BrainApiAdapter.intentList(nucleus, type);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          result.error || 'Failed to list intents'
        ),
        timestamp: new Date().toISOString()
      });
    }

    return {
      ok: true,
      data: {
        intents: result.data?.intents || []
      },
      timestamp: new Date().toISOString()
    };
  });

  // GET /api/v1/intent/get
  fastify.get('/get', {
    schema: intentSchemas.get
  }, async (request, reply) => {
    const { id, nucleus } = request.query as { id: string; nucleus: string };
    
    const result = await BrainApiAdapter.intentGet(id, nucleus);
    
    if (result.status !== 'success') {
      return reply.code(404).send({
        ok: false,
        error: createErrorResponse(
          'INTENT_NOT_FOUND',
          result.error || 'Intent not found'
        ),
        timestamp: new Date().toISOString()
      });
    }

    return {
      ok: true,
      data: result.data as Intent,
      timestamp: new Date().toISOString()
    };
  });

  // POST /api/v1/intent/create
  fastify.post('/create', {
    schema: intentSchemas.create
  }, async (request, reply) => {
    const body = request.body as {
      type: 'dev' | 'doc';
      name: string;
      files: string[];
      nucleus: string;
      problem?: string;
      expectedOutput?: string;
    };
    
    const result = await BrainApiAdapter.intentCreate({
      type: body.type,
      name: body.name,
      files: body.files,
      nucleusPath: body.nucleus,
      problem: body.problem,
      expectedOutput: body.expectedOutput
    });
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse(
          'BRAIN_EXECUTION_FAILED',
          result.error || 'Failed to create intent'
        ),
        timestamp: new Date().toISOString()
      });
    }

    // Broadcast WebSocket event
    const deps = (fastify as any).deps;
    deps.wsManager?.broadcast('intents:created', {
      intent: result.data
    });

    return reply.code(201).send({
      ok: true,
      data: result.data as Intent,
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/v1/intent/state
  fastify.get('/state', {
    schema: intentSchemas.state
  }, async (request, reply) => {
    const { id, nucleus } = request.query as { id: string; nucleus: string };
    
    const result = await BrainApiAdapter.intentState(id, nucleus);
    
    if (result.status !== 'success') {
      return reply.code(404).send({
        ok: false,
        error: createErrorResponse('INTENT_NOT_FOUND', result.error || 'Intent not found'),
        timestamp: new Date().toISOString()
      });
    }

    return {
      ok: true,
      data: result.data as Intent,
      timestamp: new Date().toISOString()
    };
  });

  // POST /api/v1/intent/submit
  fastify.post('/submit', {
    schema: intentSchemas.submit
  }, async (request, reply) => {
    const { id, nucleus } = request.body as { id: string; nucleus: string };
    
    const result = await BrainApiAdapter.intentSubmit(id, nucleus);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse('BRAIN_EXECUTION_FAILED', result.error || 'Failed to submit intent'),
        timestamp: new Date().toISOString()
      });
    }

    const deps = (fastify as any).deps;
    deps.wsManager?.broadcast('intent:submitted', { id, nucleus });

    return {
      ok: true,
      data: { message: 'Intent submitted successfully' },
      timestamp: new Date().toISOString()
    };
  });

  // POST /api/v1/intent/approve
  fastify.post('/approve', {
    schema: intentSchemas.approve
  }, async (request, reply) => {
    const { id, nucleus } = request.body as { id: string; nucleus: string };
    
    // IMPORTANT: Uses merge command per Addendum
    const result = await BrainApiAdapter.intentApprove(id, nucleus);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse('BRAIN_EXECUTION_FAILED', result.error || 'Failed to approve intent'),
        timestamp: new Date().toISOString()
      });
    }

    const deps = (fastify as any).deps;
    deps.wsManager?.broadcast('intent:approved', { id, nucleus });

    return {
      ok: true,
      data: { message: 'Intent merged successfully' },
      timestamp: new Date().toISOString()
    };
  });

  // POST /api/v1/intent/cancel
  fastify.post('/cancel', {
    schema: intentSchemas.cancel
  }, async (request, reply) => {
    const { id, nucleus } = request.body as { id: string; nucleus: string };
    
    // IMPORTANT: Uses unlock --cleanup per Addendum
    const result = await BrainApiAdapter.intentCancel(id, nucleus);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse('BRAIN_EXECUTION_FAILED', result.error || 'Failed to cancel intent'),
        timestamp: new Date().toISOString()
      });
    }

    const deps = (fastify as any).deps;
    deps.wsManager?.broadcast('intent:cancelled', { id, nucleus });

    return {
      ok: true,
      data: { message: 'Intent cancelled and cleaned up' },
      timestamp: new Date().toISOString()
    };
  });

  // POST /api/v1/intent/recover
  fastify.post('/recover', {
    schema: intentSchemas.recover
  }, async (request, reply) => {
    const { id, nucleus } = request.body as { id: string; nucleus: string };
    
    const result = await BrainApiAdapter.intentRecover(id, nucleus);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse('BRAIN_EXECUTION_FAILED', result.error || 'Failed to recover intent'),
        timestamp: new Date().toISOString()
      });
    }

    return {
      ok: true,
      data: { message: 'Intent recovered successfully' },
      timestamp: new Date().toISOString()
    };
  });

  // POST /api/v1/intent/lock
  fastify.post('/lock', {
    schema: intentSchemas.lock
  }, async (request, reply) => {
    const { id, nucleus } = request.body as { id: string; nucleus: string };
    
    const result = await BrainApiAdapter.intentLock(id, nucleus);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse('BRAIN_EXECUTION_FAILED', result.error || 'Failed to lock intent'),
        timestamp: new Date().toISOString()
      });
    }

    return { ok: true, timestamp: new Date().toISOString() };
  });

  // POST /api/v1/intent/unlock
  fastify.post('/unlock', {
    schema: intentSchemas.unlock
  }, async (request, reply) => {
    const { id, nucleus, force } = request.body as { 
      id: string; 
      nucleus: string; 
      force?: boolean 
    };
    
    const result = await BrainApiAdapter.intentUnlock(id, nucleus, force);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse('BRAIN_EXECUTION_FAILED', result.error || 'Failed to unlock intent'),
        timestamp: new Date().toISOString()
      });
    }

    return { ok: true, timestamp: new Date().toISOString() };
  });

  // DELETE /api/v1/intent/delete
  fastify.delete('/delete', {
    schema: intentSchemas.delete
  }, async (request, reply) => {
    const { id, nucleus, force } = request.query as { 
      id: string; 
      nucleus: string;
      force?: boolean 
    };
    
    const result = await BrainApiAdapter.intentDelete(id, nucleus, force);
    
    if (result.status !== 'success') {
      return reply.code(500).send({
        ok: false,
        error: createErrorResponse('BRAIN_EXECUTION_FAILED', result.error || 'Failed to delete intent'),
        timestamp: new Date().toISOString()
      });
    }

    const deps = (fastify as any).deps;
    deps.wsManager?.broadcast('intent:deleted', { id, nucleus });

    return { ok: true, timestamp: new Date().toISOString() };
  });
};