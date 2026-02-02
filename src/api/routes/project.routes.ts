import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BrainApiAdapter } from '../adapters/BrainApiAdapter'; // ← Mantengo BrainApiAdapter (puedes cambiar a AIRuntimeAdapter después)
import { z } from 'zod';

const ProjectDetectSchema = z.object({
  parent_path: z.string().min(1),
  max_depth: z.number().optional(),
  strategy: z.string().optional(),
  min_confidence: z.enum(['high', 'medium', 'low']).optional()
});

const ProjectAddSchema = z.object({
  project_path: z.string().min(1),
  nucleus_path: z.string().min(1),
  name: z.string().optional(),
  strategy: z.string().optional(),
  description: z.string().optional(),
  repo_url: z.string().optional()
});

const ProjectCloneAndAddSchema = z.object({
  repo_url: z.string().url(),
  nucleus_path: z.string().min(1),
  destination: z.string().optional(),
  name: z.string().optional(),
  strategy: z.string().optional()
});

export async function projectRoutes(fastify: FastifyInstance) {
  
  // POST /api/v1/project/detect
  fastify.post('/detect', {
    schema: {
      description: 'Detect projects in a parent directory',
      tags: ['project'],
      body: {
        type: 'object',
        required: ['parent_path'],
        properties: {
          parent_path: { type: 'string', description: 'Parent directory to scan' },
          max_depth: { type: 'number', description: 'Maximum scan depth' },
          strategy: { type: 'string', description: 'Filter by strategy type' },
          min_confidence: { 
            type: 'string', 
            enum: ['high', 'medium', 'low'],
            description: 'Minimum confidence level' 
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            parent_path: { type: 'string' },
            projects_found: { type: 'number' },
            projects: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  name: { type: 'string' },
                  strategy: { type: 'string' },
                  confidence: { type: 'string' },
                  indicators_found: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof ProjectDetectSchema>
  }>, reply: FastifyReply) => {
    const validated = ProjectDetectSchema.parse(request.body);
    
    // Solo pasamos los parámetros que BrainApiAdapter.projectDetect acepta actualmente
    const result = await BrainApiAdapter.projectDetect({
      parentPath: validated.parent_path
      // maxDepth, strategy y minConfidence se omiten porque NO existen en la interfaz actual
      // Cuando los agregues al adapter, descomenta:
      // maxDepth: validated.max_depth,
      // strategy: validated.strategy,
      // minConfidence: validated.min_confidence
    });
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to detect projects' 
      });
    }
    
    return result.data;
  });

  // POST /api/v1/project/add
  fastify.post('/add', {
    schema: {
      description: 'Link an existing project to a nucleus',
      tags: ['project'],
      body: {
        type: 'object',
        required: ['project_path', 'nucleus_path'],
        properties: {
          project_path: { type: 'string' },
          nucleus_path: { type: 'string' },
          name: { type: 'string' },
          strategy: { type: 'string' },
          description: { type: 'string' },
          repo_url: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            path: { type: 'string' },
            strategy: { type: 'string' },
            nucleus_path: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof ProjectAddSchema>
  }>, reply: FastifyReply) => {
    const validated = ProjectAddSchema.parse(request.body);
    
    const result = await BrainApiAdapter.projectAdd({
      projectPath: validated.project_path,
      nucleusPath: validated.nucleus_path,
      name: validated.name,
      description: validated.description,
      repoUrl: validated.repo_url
      // strategy se omite por ahora (agrega cuando lo soporte el adapter)
    });
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to add project' 
      });
    }
    
    // Broadcast project added event
    const wsManager = (request as any).wsManager;
    wsManager?.broadcast('project:added', result.data);
    
    return reply.code(201).send(result.data);
  });

  // POST /api/v1/project/clone-and-add
  fastify.post('/clone-and-add', {
    schema: {
      description: 'Clone a Git repository and link it to nucleus',
      tags: ['project'],
      body: {
        type: 'object',
        required: ['repo_url', 'nucleus_path'],
        properties: {
          repo_url: { type: 'string', format: 'uri' },
          nucleus_path: { type: 'string' },
          destination: { type: 'string' },
          name: { type: 'string' },
          strategy: { type: 'string' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            cloned_path: { type: 'string' },
            repo_url: { type: 'string' },
            project: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof ProjectCloneAndAddSchema>
  }>, reply: FastifyReply) => {
    const validated = ProjectCloneAndAddSchema.parse(request.body);
    
    const wsManager = (request as any).wsManager;
    
    const result = await BrainApiAdapter.projectCloneAndAdd({
      repoUrl: validated.repo_url,
      nucleusPath: validated.nucleus_path,
      destination: validated.destination,
      name: validated.name
      // strategy se omite por ahora
    });
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to clone and add project' 
      });
    }
    
    wsManager?.broadcast('project:cloned', result.data);
    
    return reply.code(201).send(result.data);
  });
}