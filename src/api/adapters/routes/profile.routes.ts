import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BrainApiAdapter } from '../adapters/BrainApiAdapter';
import { z } from 'zod';

const ProfileCreateSchema = z.object({
  alias: z.string().min(1)
});

const ProfileValidateSchema = z.object({
  id: z.string().min(1)
});

const AccountRegisterSchema = z.object({
  profile_id: z.string().min(1),
  provider: z.string().min(1),
  email: z.string().email()
});

export async function profileRoutes(fastify: FastifyInstance) {
  
  // GET /api/v1/profile/list
  fastify.get('/list', {
    schema: {
      description: 'List all Chrome profiles with AI accounts',
      tags: ['profile'],
      response: {
        200: {
          type: 'object',
          properties: {
            profiles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  alias: { type: 'string' },
                  email: { type: 'string' },
                  accounts: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        provider: { type: 'string' },
                        email: { type: 'string' },
                        status: { type: 'string' },
                        quota: { type: 'number' },
                        usage_remaining: { type: 'number' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await BrainApiAdapter.profileList();
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to list profiles' 
      });
    }
    
    return { profiles: result.data.profiles };
  });

  // POST /api/v1/profile/create
  fastify.post('/create', {
    schema: {
      description: 'Create a new Chrome profile',
      tags: ['profile'],
      body: {
        type: 'object',
        required: ['alias'],
        properties: {
          alias: { type: 'string', description: 'Profile alias/name' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            alias: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof ProfileCreateSchema>
  }>, reply: FastifyReply) => {
    const validated = ProfileCreateSchema.parse(request.body);
    
    const result = await BrainApiAdapter.profileCreate(validated.alias);
    
    if (result.status !== 'success' || !result.data) {
      return reply.code(500).send({ 
        error: result.error || 'Failed to create profile' 
      });
    }
    
    return reply.code(201).send(result.data);
  });

  // POST /api/v1/profile/validate
  fastify.post('/validate', {
    schema: {
      description: 'Validate AI accounts for a profile',
      tags: ['profile'],
      body: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Profile ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            accounts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  provider: { type: 'string' },
                  valid: { type: 'boolean' },
                  quota: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof ProfileValidateSchema>
  }>, reply: FastifyReply) => {
    const validated = ProfileValidateSchema.parse(request.body);
    
    // TODO: Implement account validation logic
    // For now, return mock response
    return {
      valid: true,
      accounts: []
    };
  });

  // POST /api/v1/profile/account/register
  fastify.post('/account/register', {
    schema: {
      description: 'Register an AI account to a profile',
      tags: ['profile'],
      body: {
        type: 'object',
        required: ['profile_id', 'provider', 'email'],
        properties: {
          profile_id: { type: 'string' },
          provider: { type: 'string', description: 'AI provider (google, openai, anthropic, etc)' },
          email: { type: 'string', format: 'email' }
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
    Body: z.infer<typeof AccountRegisterSchema>
  }>, reply: FastifyReply) => {
    const validated = AccountRegisterSchema.parse(request.body);
    
    const result = await BrainApiAdapter.profileAccountsRegister(
      validated.profile_id,
      validated.provider,
      validated.email
    );
    
    if (result.status !== 'success') {
      return reply.code(500).send({ 
        error: result.error || 'Failed to register account' 
      });
    }
    
    return reply.code(201).send({ success: true });
  });

  // DELETE /api/v1/profile/:id
  fastify.delete('/:id', {
    schema: {
      description: 'Delete a Chrome profile',
      tags: ['profile'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          force: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { id: string };
    Querystring: { force?: boolean }
  }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { force } = request.query;
    
    const result = await BrainApiAdapter.profileDestroy(id, force);
    
    if (result.status !== 'success') {
      return reply.code(500).send({ 
        error: result.error || 'Failed to delete profile' 
      });
    }
    
    return { success: true };
  });
}