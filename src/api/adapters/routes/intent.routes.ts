import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BrainApiAdapter } from '../adapters/BrainApiAdapter';
import { z } from 'zod';

const IntentCreateSchema = z.object({
  type: z.enum(['dev', 'doc']),
  name: z.string().min(1),
  files: z.array(z.string()),
  nucleus: z.string().min(1)
});

const IntentLockSchema = z.object({
  id: z.string().min(1),
  nucleus: z.string().min(1)
});

const IntentUnlockSchema = z.object({
  id: z.string().min(1),
  nucleus: z.string().min(1),
  force: z.boolean().optional()
});

const IntentAddTurnSchema = z.object({
  id: z.string().min(1),
  actor: z.enum(['user', 'ai']),
  content: z.string().min(1),
  nucleus: z.string().min(1)
});

const IntentFinalizeSchema = z.object({
  id: z.string().min(1),
  nucleus: z.string().min(1)
});

const IntentDeleteSchema = z.object({
  id: z.string().min(1),
  nucleus: z.string().min(1),
  force: z.boolean().optional()
});

export async function intentRoutes(fastify: FastifyInstance) {
  
  // GET /api/v1/intent/list
  fastify.get('/list', {
    schema: {
      description: 'List all intents in a nucleus',
      tags: ['intent'],
      querystring: {
        type: 'object',
        required: ['nucleus'],
        properties: {
          nucleus: { type: 'string', description: 'Nucleus path' },
          type: { 
            type: 'string', 
            enum: ['dev', 'doc'],
            description: 'Filter by intent type' 
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            intents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  name: { type: 'string' },
                  status: { type: 'string' },
                  locked: { type: 'boolean' },
                  locked_by: { type: ['string', 'null'] },
                  created_at: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { nucleus: string; type?: 'dev' | 'doc' }
  }>, reply: FastifyReply) => {
    const { nucleus, type } = request.query;
    
    if (!nucleus) {
      return reply.code(400).send({ error: 'Missing nucleus parameter' });
    }
    
    const result = await BrainApiAdapter.intentList(nucleus, type);
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to list intents' 
      });
    }
    
    return { intents: result.data.intents };
  });

  // GET /api/v1/intent/get
  fastify.get('/get', {
    schema: {
      description: 'Get complete information about a specific intent',
      tags: ['intent'],
      querystring: {
        type: 'object',
        required: ['id', 'nucleus'],
        properties: {
          id: { type: 'string', description: 'Intent UUID' },
          nucleus: { type: 'string', description: 'Nucleus path' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string' },
            briefing: { type: 'object' },
            turns: { type: 'array' },
            files: { type: 'array' },
            status: { type: 'string' },
            locked: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { id: string; nucleus: string }
  }>, reply: FastifyReply) => {
    const { id, nucleus } = request.query;
    
    if (!id || !nucleus) {
      return reply.code(400).send({ error: 'Missing id or nucleus parameter' });
    }
    
    const result = await BrainApiAdapter.intentGet(id, nucleus);
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to get intent' 
      });
    }
    
    return result.data;
  });

  // POST /api/v1/intent/create
  fastify.post('/create', {
    schema: {
      description: 'Create a new intent (DEV or DOC)',
      tags: ['intent'],
      body: {
        type: 'object',
        required: ['type', 'name', 'files', 'nucleus'],
        properties: {
          type: { type: 'string', enum: ['dev', 'doc'] },
          name: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          nucleus: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            folder: { type: 'string' },
            path: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof IntentCreateSchema>
  }>, reply: FastifyReply) => {
    const validated = IntentCreateSchema.parse(request.body);
    
    const result = await BrainApiAdapter.intentCreate({
      type: validated.type,
      name: validated.name,
      files: validated.files,
      nucleusPath: validated.nucleus
    });
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to create intent' 
      });
    }
    
    // Broadcast creation event
    const wsManager = (request as any).wsManager;
    wsManager?.broadcast('intent:created', result.data);
    
    return reply.code(201).send(result.data);
  });

  // POST /api/v1/intent/lock
  fastify.post('/lock', {
    schema: {
      description: 'Lock an intent for exclusive access',
      tags: ['intent'],
      body: {
        type: 'object',
        required: ['id', 'nucleus'],
        properties: {
          id: { type: 'string' },
          nucleus: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            locked: { type: 'boolean' },
            by: { type: 'string' },
            at: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof IntentLockSchema>
  }>, reply: FastifyReply) => {
    const validated = IntentLockSchema.parse(request.body);
    
    const result = await BrainApiAdapter.intentLock(validated.id, validated.nucleus);
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to lock intent' 
      });
    }
    
    // Broadcast lock event
    const wsManager = (request as any).wsManager;
    wsManager?.broadcast('intent:updated', {
      intentId: validated.id,
      status: 'locked',
      locked: true
    });
    
    return result.data;
  });

  // POST /api/v1/intent/unlock
  fastify.post('/unlock', {
    schema: {
      description: 'Unlock an intent',
      tags: ['intent'],
      body: {
        type: 'object',
        required: ['id', 'nucleus'],
        properties: {
          id: { type: 'string' },
          nucleus: { type: 'string' },
          force: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            locked: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof IntentUnlockSchema>
  }>, reply: FastifyReply) => {
    const validated = IntentUnlockSchema.parse(request.body);
    
    const result = await BrainApiAdapter.intentUnlock(
      validated.id,
      validated.nucleus,
      validated.force
    );
    
    if (result.status !== 'success') {
      return reply.code(500).send({ 
        error: result.error || 'Failed to unlock intent' 
      });
    }
    
    // Broadcast unlock event
    const wsManager = (request as any).wsManager;
    wsManager?.broadcast('intent:updated', {
      intentId: validated.id,
      status: 'active',
      locked: false
    });
    
    return { locked: false };
  });

  // POST /api/v1/intent/add-turn
  fastify.post('/add-turn', {
    schema: {
      description: 'Add a conversation turn to intent chat',
      tags: ['intent'],
      body: {
        type: 'object',
        required: ['id', 'actor', 'content', 'nucleus'],
        properties: {
          id: { type: 'string' },
          actor: { type: 'string', enum: ['user', 'ai'] },
          content: { type: 'string' },
          nucleus: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            turn_id: { type: 'number' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof IntentAddTurnSchema>
  }>, reply: FastifyReply) => {
    const validated = IntentAddTurnSchema.parse(request.body);
    
    const result = await BrainApiAdapter.intentAddTurn({
      intentId: validated.id,
      actor: validated.actor,
      content: validated.content,
      nucleusPath: validated.nucleus
    });
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to add turn' 
      });
    }
    
    return result.data;
  });

  // POST /api/v1/intent/finalize
  fastify.post('/finalize', {
    schema: {
      description: 'Finalize intent and apply changes',
      tags: ['intent'],
      body: {
        type: 'object',
        required: ['id', 'nucleus'],
        properties: {
          id: { type: 'string' },
          nucleus: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            files_modified: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof IntentFinalizeSchema>
  }>, reply: FastifyReply) => {
    const validated = IntentFinalizeSchema.parse(request.body);
    
    const result = await BrainApiAdapter.intentFinalize(
      validated.id,
      validated.nucleus
    );
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to finalize intent' 
      });
    }
    
    // Broadcast finalize event
    const wsManager = (request as any).wsManager;
    wsManager?.broadcast('intent:updated', {
      intentId: validated.id,
      status: 'completed'
    });
    
    return result.data;
  });

  // DELETE /api/v1/intent/delete
  fastify.delete('/delete', {
    schema: {
      description: 'Delete an intent completely',
      tags: ['intent'],
      body: {
        type: 'object',
        required: ['id', 'nucleus'],
        properties: {
          id: { type: 'string' },
          nucleus: { type: 'string' },
          force: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof IntentDeleteSchema>
  }>, reply: FastifyReply) => {
    const validated = IntentDeleteSchema.parse(request.body);
    
    const result = await BrainApiAdapter.intentDelete(
      validated.id,
      validated.nucleus,
      validated.force
    );
    
    if (result.status !== 'success') {
      return reply.code(500).send({ 
        error: result.error || 'Failed to delete intent' 
      });
    }
    
    return { success: true };
  });
}