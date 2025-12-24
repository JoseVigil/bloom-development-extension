import type { FastifySchema } from 'fastify';

export const projectSchemas = {
  detect: {
    tags: ['project'],
    summary: 'Detect projects in directory',
    body: {
      type: 'object',
      required: ['parentPath'],
      properties: {
        parentPath: { type: 'string' },
        maxDepth: { type: 'number', minimum: 1, maximum: 10 },
        strategy: { type: 'string' },
        minConfidence: { type: 'string', enum: ['high', 'medium', 'low'] }
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
            required: ['projects'],
            properties: {
              projects: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['path', 'name', 'strategy', 'confidence'],
                  properties: {
                    path: { type: 'string' },
                    name: { type: 'string' },
                    strategy: { type: 'string' },
                    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                    indicators_found: { type: 'array', items: { type: 'string' } }
                  }
                }
              }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  add: {
    tags: ['project'],
    summary: 'Link project to nucleus',
    body: {
      type: 'object',
      required: ['projectPath', 'nucleusPath'],
      properties: {
        projectPath: { type: 'string' },
        nucleusPath: { type: 'string' },
        name: { type: 'string' },
        strategy: { type: 'string' },
        description: { type: 'string' },
        repoUrl: { type: 'string', format: 'uri' }
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
            required: ['name', 'path', 'strategy', 'nucleus_path'],
            properties: {
              name: { type: 'string' },
              path: { type: 'string' },
              strategy: { type: 'string' },
              nucleus_path: { type: 'string' },
              repo_url: { type: 'string' }
            }
          },
          timestamp: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  cloneAndAdd: {
    tags: ['project'],
    summary: 'Clone repo and link to nucleus',
    body: {
      type: 'object',
      required: ['repoUrl', 'nucleusPath'],
      properties: {
        repoUrl: { type: 'string', format: 'uri' },
        nucleusPath: { type: 'string' },
        destination: { type: 'string' },
        name: { type: 'string' },
        strategy: { type: 'string' }
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
            required: ['project'],
            properties: {
              project: {
                type: 'object',
                required: ['name', 'path', 'strategy'],
                properties: {
                  name: { type: 'string' },
                  path: { type: 'string' },
                  strategy: { type: 'string' },
                  nucleus_path: { type: 'string' }
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