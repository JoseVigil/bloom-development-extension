import type { FastifySchema } from 'fastify';

export const explorerSchemas = {
  tree: {
    tags: ['explorer'],
    summary: 'Get directory tree',
    querystring: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path from .bloom/' }
      }
    },
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'path', 'type'],
          properties: {
            name: { type: 'string' },
            path: { type: 'string' },
            type: { type: 'string', enum: ['file', 'directory'] },
            children: {
              type: 'array',
              items: { type: 'object' }
            }
          }
        }
      }
    }
  } as FastifySchema,

  file: {
    tags: ['explorer'],
    summary: 'Get file content',
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
        required: ['path', 'content', 'extension'],
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          extension: { type: 'string' }
        }
      }
    }
  } as FastifySchema,

  refresh: {
    tags: ['explorer'],
    summary: 'Refresh explorer cache',
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' }
        }
      }
    }
  } as FastifySchema
};