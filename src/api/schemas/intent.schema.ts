import type { FastifySchema } from 'fastify';

export const intentSchemas = {
  list: {
    tags: ['intent'],
    summary: 'List intents',
    querystring: {
      type: 'object',
      required: ['nucleus'],
      properties: {
        nucleus: { type: 'string' },
        type: { type: 'string', enum: ['dev', 'doc'] }
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
            required: ['intents'],
            properties: {
              intents: { type: 'array', items: { type: 'object' } }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  get: {
    tags: ['intent'],
    summary: 'Get intent by ID',
    querystring: {
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
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean' },
          data: { type: 'object' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  create: {
    tags: ['intent'],
    summary: 'Create new intent',
    body: {
      type: 'object',
      required: ['type', 'name', 'files', 'nucleus'],
      properties: {
        type: { type: 'string', enum: ['dev', 'doc'] },
        name: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        nucleus: { type: 'string' },
        problem: { type: 'string' },
        expectedOutput: { type: 'string' }
      }
    },
    response: {
      201: {
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

  state: {
    tags: ['intent'],
    summary: 'Get intent state',
    querystring: {
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
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean' },
          data: { type: 'object' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  submit: {
    tags: ['intent'],
    summary: 'Submit intent for review',
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
        required: ['ok'],
        properties: {
          ok: { type: 'boolean' },
          data: { type: 'object' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  approve: {
    tags: ['intent'],
    summary: 'Approve and merge intent',
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
        required: ['ok'],
        properties: {
          ok: { type: 'boolean' },
          data: { type: 'object' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  cancel: {
    tags: ['intent'],
    summary: 'Cancel intent with cleanup',
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
        required: ['ok'],
        properties: {
          ok: { type: 'boolean' },
          data: { type: 'object' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  recover: {
    tags: ['intent'],
    summary: 'Recover failed intent',
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
        required: ['ok'],
        properties: {
          ok: { type: 'boolean' },
          data: { type: 'object' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  lock: {
    tags: ['intent'],
    summary: 'Lock intent for editing',
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
          ok: { type: 'boolean' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  unlock: {
    tags: ['intent'],
    summary: 'Unlock intent',
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
          ok: { type: 'boolean' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  delete: {
    tags: ['intent'],
    summary: 'Delete intent',
    querystring: {
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
          ok: { type: 'boolean' },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema
};