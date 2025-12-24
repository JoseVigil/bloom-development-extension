import type { FastifySchema } from 'fastify';

export const profileSchemas = {
  list: {
    tags: ['profile'],
    summary: 'List all Chrome profiles',
    response: {
      200: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean', const: true },
          data: {
            type: 'object',
            required: ['profiles'],
            properties: {
              profiles: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'name', 'path', 'ai_accounts'],
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    path: { type: 'string' },
                    ai_accounts: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['provider', 'account_id', 'status', 'last_checked'],
                        properties: {
                          provider: { type: 'string', enum: ['google', 'openai', 'anthropic', 'github'] },
                          account_id: { type: 'string' },
                          status: { type: 'string', enum: ['active', 'inactive', 'quota_exceeded', 'error'] },
                          usage_remaining: { type: 'number' },
                          quota: { type: 'number' },
                          last_checked: { type: 'string', format: 'date-time' },
                          error: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          timestamp: { type: 'string', format: 'date-time' }
        }
      }
    }
  } as FastifySchema,

  get: {
    tags: ['profile'],
    summary: 'Get profile by ID',
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' }
      }
    },
    response: {
      200: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['id', 'name', 'path', 'ai_accounts'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              path: { type: 'string' },
              ai_accounts: { type: 'array' }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  create: {
    tags: ['profile'],
    summary: 'Create new Chrome profile',
    body: {
      type: 'object',
      required: ['alias'],
      properties: {
        alias: { type: 'string', minLength: 1 }
      }
    },
    response: {
      201: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['id', 'name', 'path', 'ai_accounts'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              path: { type: 'string' },
              ai_accounts: { type: 'array' }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  destroy: {
    tags: ['profile'],
    summary: 'Delete Chrome profile',
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' }
      }
    },
    querystring: {
      type: 'object',
      properties: {
        force: { type: 'boolean', default: false }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  refreshAccounts: {
    tags: ['profile'],
    summary: 'Refresh AI accounts for profile',
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' }
      }
    },
    response: {
      200: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['accounts'],
            properties: {
              accounts: { type: 'array' }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  registerAccount: {
    tags: ['profile'],
    summary: 'Register AI account to profile',
    params: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' }
      }
    },
    body: {
      type: 'object',
      required: ['provider', 'email'],
      properties: {
        provider: { type: 'string', enum: ['google', 'openai', 'anthropic', 'github'] },
        email: { type: 'string', format: 'email' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema
};