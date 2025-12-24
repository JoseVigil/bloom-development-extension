import type { FastifySchema } from 'fastify';

export const authSchemas = {
  status: {
    tags: ['auth'],
    summary: 'Get overall auth status',
    response: {
      200: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['githubAuthenticated', 'geminiConfigured'],
            properties: {
              githubAuthenticated: { type: 'boolean' },
              geminiConfigured: { type: 'boolean' },
              githubUsername: { type: 'string', nullable: true },
              allOrgs: { type: 'array', items: { type: 'string' } }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  githubStatus: {
    tags: ['auth'],
    summary: 'Get GitHub auth status',
    response: {
      200: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['authenticated'],
            properties: {
              authenticated: { type: 'boolean' },
              user: { type: 'object', nullable: true },
              organizations: { type: 'array', items: { type: 'object' } }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  githubLogin: {
    tags: ['auth'],
    summary: 'Login to GitHub',
    body: {
      type: 'object',
      required: ['token'],
      properties: {
        token: { type: 'string', minLength: 1 }
      }
    },
    response: {
      200: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean' },
          data: { type: 'object' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  githubLogout: {
    tags: ['auth'],
    summary: 'Logout from GitHub',
    response: {
      200: {
        type: 'object',
        required: ['ok'],
        properties: {
          ok: { type: 'boolean' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  githubOrgs: {
    tags: ['auth'],
    summary: 'List GitHub organizations',
    response: {
      200: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['organizations'],
            properties: {
              organizations: { type: 'array', items: { type: 'object' } }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  githubRepos: {
    tags: ['auth'],
    summary: 'List GitHub repositories',
    querystring: {
      type: 'object',
      properties: {
        org: { type: 'string' }
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
            required: ['repositories'],
            properties: {
              repositories: { type: 'array', items: { type: 'object' } }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  geminiAddKey: {
    tags: ['auth'],
    summary: 'Add Gemini API key',
    body: {
      type: 'object',
      required: ['profile', 'key'],
      properties: {
        profile: { type: 'string' },
        key: { type: 'string' },
        priority: { type: 'number' }
      }
    },
    response: {
      200: {
        type: 'object',
        required: ['ok'],
        properties: {
          ok: { type: 'boolean' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  geminiKeys: {
    tags: ['auth'],
    summary: 'List Gemini API keys',
    response: {
      200: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['keys'],
            properties: {
              keys: { type: 'array', items: { type: 'object' } }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  geminiValidate: {
    tags: ['auth'],
    summary: 'Validate Gemini API key',
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
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['valid'],
            properties: {
              valid: { type: 'boolean' }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema
};