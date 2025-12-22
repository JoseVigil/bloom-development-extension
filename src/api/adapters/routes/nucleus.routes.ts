import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BrainApiAdapter } from '../adapters/BrainApiAdapter';
import { z } from 'zod';

const NucleusCreateSchema = z.object({
  org: z.string().min(1),
  path: z.string().optional(),
  url: z.string().url().optional(),
  force: z.boolean().optional()
});

const NucleusDeleteSchema = z.object({
  path: z.string().min(1),
  force: z.boolean().optional()
});

export async function nucleusRoutes(fastify: FastifyInstance) {
  
  // GET /api/v1/nucleus/list
  fastify.get('/list', {
    schema: {
      description: 'List all nuclei in a parent directory',
      tags: ['nucleus'],
      querystring: {
        type: 'object',
        properties: {
          parent: { type: 'string', description: 'Parent directory to scan' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            nuclei: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  org: { type: 'string' },
                  path: { type: 'string' },
                  projects_count: { type: 'number' },
                  created_at: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { parent?: string }
  }>, reply: FastifyReply) => {
    const { parent } = request.query;
    
    const result = await BrainApiAdapter.nucleusList(parent);
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to list nuclei' 
      });
    }
    
    return { nuclei: result.data.nuclei };
  });

  // GET /api/v1/nucleus/get
  fastify.get('/get', {
    schema: {
      description: 'Get detailed information about a specific nucleus',
      tags: ['nucleus'],
      querystring: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Nucleus path' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            organization: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                url: { type: 'string' }
              }
            },
            path: { type: 'string' },
            projects: { type: 'array' },
            config: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { path: string }
  }>, reply: FastifyReply) => {
    const { path } = request.query;
    
    if (!path) {
      return reply.code(400).send({ error: 'Missing path parameter' });
    }
    
    const result = await BrainApiAdapter.nucleusGet(path);
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to get nucleus' 
      });
    }
    
    return result.data;
  });

  // POST /api/v1/nucleus/create
  fastify.post('/create', {
    schema: {
      description: 'Create a new Nucleus project',
      tags: ['nucleus'],
      body: {
        type: 'object',
        required: ['org'],
        properties: {
          org: { type: 'string', description: 'Organization name' },
          path: { type: 'string', description: 'Target path (default: current dir)' },
          url: { type: 'string', description: 'Organization URL' },
          force: { type: 'boolean', description: 'Force overwrite existing' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            path: { type: 'string' },
            created_at: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof NucleusCreateSchema>
  }>, reply: FastifyReply) => {
    const validated = NucleusCreateSchema.parse(request.body);
    
    const wsManager = (request as any).wsManager;
    
    const result = await BrainApiAdapter.nucleusCreate({
      ...validated,
      onProgress: (line) => {
        wsManager?.broadcast('nucleus:progress', { line });
      }
    });
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to create nucleus' 
      });
    }
    
    // Broadcast creation event
    wsManager?.broadcast('nucleus:created', result.data);
    
    return reply.code(201).send(result.data);
  });

  // DELETE /api/v1/nucleus/delete
  fastify.delete('/delete', {
    schema: {
      description: 'Delete a nucleus completely',
      tags: ['nucleus'],
      body: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' },
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
    Body: z.infer<typeof NucleusDeleteSchema>
  }>, reply: FastifyReply) => {
    const validated = NucleusDeleteSchema.parse(request.body);
    
    const result = await BrainApiAdapter.nucleusDelete(
      validated.path,
      validated.force
    );
    
    if (result.status !== 'success') {
      return reply.code(500).send({ 
        error: result.error || 'Failed to delete nucleus' 
      });
    }
    
    return { success: true };
  });

  // POST /api/v1/nucleus/sync
  fastify.post('/sync', {
    schema: {
      description: 'Synchronize nucleus projects (git pull + rebuild cache)',
      tags: ['nucleus'],
      body: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' },
          skip_git: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: { path: string; skip_git?: boolean }
  }>, reply: FastifyReply) => {
    const { path, skip_git } = request.body;
    
    const result = await BrainApiAdapter.nucleusSync(path, skip_git);
    
    if (result.status !== 'success') {
      return reply.code(500).send({ 
        error: result.error || 'Failed to sync nucleus' 
      });
    }
    
    return { success: true };
  });

  // GET /api/v1/nucleus/projects
  fastify.get('/projects', {
    schema: {
      description: 'List all projects in a nucleus',
      tags: ['nucleus'],
      querystring: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string' },
          strategy: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { path: string; strategy?: string }
  }>, reply: FastifyReply) => {
    const { path, strategy } = request.query;
    
    if (!path) {
      return reply.code(400).send({ error: 'Missing path parameter' });
    }
    
    const result = await BrainApiAdapter.nucleusListProjects(path, strategy);
    
    if (result.status !== 'success') {
      return reply.code(500).send({ 
        error: result.error || 'Failed to list projects' 
      });
    }
    
    return result.data;
  });
}