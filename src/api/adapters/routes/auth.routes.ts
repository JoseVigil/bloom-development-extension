import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BrainApiAdapter } from '../adapters/BrainApiAdapter';
import { z } from 'zod';

const GithubLoginSchema = z.object({
  token: z.string().min(1)
});

const GeminiKeyAddSchema = z.object({
  profile: z.string().min(1),
  key: z.string().min(1),
  priority: z.number().optional()
});

export async function authRoutes(fastify: FastifyInstance) {
  
  // GET /api/v1/auth/github/status
  fastify.get('/github/status', {
    schema: {
      description: 'Check GitHub authentication status',
      tags: ['auth'],
      response: {
        200: {
          type: 'object',
          properties: {
            authenticated: { type: 'boolean' },
            user: {
              type: 'object',
              properties: {
                login: { type: 'string' },
                id: { type: 'number' },
                name: { type: 'string' },
                email: { type: 'string' }
              }
            },
            organizations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  login: { type: 'string' },
                  id: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await BrainApiAdapter.githubAuthStatus();
    
    if (result.status !== 'success') {
      return {
        authenticated: false,
        user: null,
        organizations: []
      };
    }
    
    return result.data;
  });

  // POST /api/v1/auth/github/login
  fastify.post('/github/login', {
    schema: {
      description: 'Store GitHub authentication token',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'GitHub Personal Access Token' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            user: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof GithubLoginSchema>
  }>, reply: FastifyReply) => {
    const validated = GithubLoginSchema.parse(request.body);
    
    const result = await BrainApiAdapter.githubAuthLogin(validated.token);
    
    if (result.status !== 'success') {
      return reply.code(401).send({ 
        error: result.error || 'Invalid GitHub token' 
      });
    }
    
    // Broadcast auth update
    const wsManager = (request as any).wsManager;
    wsManager?.broadcast('auth:updated', {
      githubAuthenticated: true
    });
    
    return { success: true, user: result.data };
  });

  // GET /api/v1/auth/github/orgs
  fastify.get('/github/orgs', {
    schema: {
      description: 'List GitHub organizations',
      tags: ['auth'],
      response: {
        200: {
          type: 'object',
          properties: {
            organizations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'number' },
                  login: { type: 'string' },
                  avatar_url: { type: 'string' },
                  description: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await BrainApiAdapter.githubOrgsList();
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to list organizations' 
      });
    }
    
    return { organizations: result.data.organizations || [] };
  });

  // GET /api/v1/auth/github/repos
  fastify.get('/github/repos', {
    schema: {
      description: 'List GitHub repositories',
      tags: ['auth'],
      querystring: {
        type: 'object',
        properties: {
          org: { type: 'string', description: 'Organization name (optional)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            repositories: { type: 'array' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { org?: string }
  }>, reply: FastifyReply) => {
    const { org } = request.query;
    
    const result = await BrainApiAdapter.githubReposList(org);
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to list repositories' 
      });
    }
    
    return { repositories: result.data.repositories || [] };
  });

  // POST /api/v1/auth/gemini/key
  fastify.post('/gemini/key', {
    schema: {
      description: 'Add Gemini API key for a profile',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['profile', 'key'],
        properties: {
          profile: { type: 'string', description: 'Profile name' },
          key: { type: 'string', description: 'Gemini API key' },
          priority: { type: 'number', description: 'Priority (1=preferred, 0=normal, -1=backup)' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof GeminiKeyAddSchema>
  }>, reply: FastifyReply) => {
    const validated = GeminiKeyAddSchema.parse(request.body);
    
    const result = await BrainApiAdapter.geminiKeysAdd(
      validated.profile,
      validated.key,
      validated.priority
    );
    
    if (result.status !== 'success') {
      return reply.code(500).send({ 
        error: result.error || 'Failed to add Gemini key' 
      });
    }
    
    // Broadcast auth update
    const wsManager = (request as any).wsManager;
    wsManager?.broadcast('auth:updated', {
      geminiConfigured: true
    });
    
    return reply.code(201).send({ success: true });
  });

  // GET /api/v1/auth/gemini/keys
  fastify.get('/gemini/keys', {
    schema: {
      description: 'List all Gemini API keys',
      tags: ['auth'],
      response: {
        200: {
          type: 'object',
          properties: {
            keys: { type: 'array' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await BrainApiAdapter.geminiKeysList();
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to list Gemini keys' 
      });
    }
    
    return { keys: result.data.keys || [] };
  });

  // POST /api/v1/auth/gemini/validate
  fastify.post('/gemini/validate', {
    schema: {
      description: 'Validate Gemini API key for a profile',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['profile'],
        properties: {
          profile: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            quota: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: { profile: string }
  }>, reply: FastifyReply) => {
    const { profile } = request.body;
    
    const result = await BrainApiAdapter.geminiKeysValidate(profile);
    
    if (result.status !== 'success') {
      return { valid: false, quota: null };
    }
    
    return result.data;
  });
}