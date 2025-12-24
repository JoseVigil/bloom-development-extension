import type { FastifySchema } from 'fastify';

export const nucleusSchemas = {
  list: {
    tags: ['nucleus'],
    summary: 'List all nuclei',
    description: 'Returns all available nucleus projects in a parent directory',
    querystring: {
      type: 'object',
      properties: {
        parent: { type: 'string', description: 'Parent directory path' }
      }
    },
    response: {
      200: {
        type: 'object',
        required: ['ok', 'data'],
        properties: {
          ok: { type: 'boolean', const: true },
          data: {
            type: 'object',
            required: ['nuclei'],
            properties: {
              nuclei: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'organization', 'path', 'projects_count', 'intents_count'],
                  properties: {
                    id: { type: 'string' },
                    organization: { type: 'string' },
                    path: { type: 'string' },
                    repo_url: { type: 'string' },
                    projects_count: { type: 'number' },
                    intents_count: { type: 'number' },
                    created_at: { type: 'string', format: 'date-time' },
                    last_sync: { type: 'string', format: 'date-time' }
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
    tags: ['nucleus'],
    summary: 'Get nucleus details',
    querystring: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string' }
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
            required: ['id', 'organization', 'path'],
            properties: {
              id: { type: 'string' },
              organization: { type: 'string' },
              path: { type: 'string' },
              repo_url: { type: 'string' },
              projects_count: { type: 'number' },
              intents_count: { type: 'number' },
              created_at: { type: 'string' },
              last_sync: { type: 'string' }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  create: {
    tags: ['nucleus'],
    summary: 'Create new nucleus',
    body: {
      type: 'object',
      required: ['org'],
      properties: {
        org: { type: 'string', minLength: 1 },
        path: { type: 'string' },
        url: { type: 'string', format: 'uri' },
        force: { type: 'boolean', default: false }
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
            required: ['id', 'organization', 'path'],
            properties: {
              id: { type: 'string' },
              organization: { type: 'string' },
              path: { type: 'string' },
              repo_url: { type: 'string' },
              created_at: { type: 'string' }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  sync: {
    tags: ['nucleus'],
    summary: 'Sync nucleus projects',
    body: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string' },
        skip_git: { type: 'boolean', default: false }
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

  onboardingStatus: {
    tags: ['nucleus'],
    summary: 'Get onboarding status',
    querystring: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string' }
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
            required: ['completed'],
            properties: {
              completed: { type: 'boolean' },
              completed_at: { type: 'string', format: 'date-time' },
              steps: {
                type: 'object',
                required: ['github_auth', 'gemini_setup', 'nucleus_created', 'projects_linked'],
                properties: {
                  github_auth: { type: 'boolean' },
                  gemini_setup: { type: 'boolean' },
                  nucleus_created: { type: 'boolean' },
                  projects_linked: { type: 'boolean' }
                }
              }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema
};