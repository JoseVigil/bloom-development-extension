import type { FastifyRequest, FastifyReply } from 'fastify';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Validation middleware utilities
 */

/**
 * Sanitize and validate file paths
 * Prevents directory traversal attacks
 */
export function sanitizePath(inputPath: string, workspacePath?: string): string | null {
  try {
    const normalized = path.normalize(inputPath);
    
    // Prevent directory traversal
    if (normalized.includes('..')) {
      return null;
    }

    // If workspace path provided, ensure path is within workspace
    if (workspacePath && !normalized.startsWith(workspacePath)) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

/**
 * Middleware to validate path parameters
 */
export async function validatePathParam(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const body = request.body as any;
  const query = request.query as any;
  
  const pathToValidate = body?.path || query?.path || body?.projectPath || body?.nucleusPath;
  
  if (pathToValidate) {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const sanitized = sanitizePath(pathToValidate, workspacePath);
    
    if (!sanitized) {
      return reply.code(400).send({
        ok: false,
        error: {
          error_code: 'VALIDATION_ERROR',
          message: 'Invalid path provided',
          details: { path: pathToValidate }
        },
        timestamp: new Date().toISOString()
      });
    }
  }
}

/**
 * Middleware to check if workspace is open
 */
export async function requireWorkspace(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  
  if (!workspacePath) {
    return reply.code(400).send({
      ok: false,
      error: {
        error_code: 'NO_WORKSPACE',
        message: 'No workspace folder is open'
      },
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Middleware to validate required fields in body
 */
export function validateRequiredFields(fields: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as any;
    
    const missing = fields.filter(field => !body?.[field]);
    
    if (missing.length > 0) {
      return reply.code(400).send({
        ok: false,
        error: {
          error_code: 'VALIDATION_ERROR',
          message: `Missing required fields: ${missing.join(', ')}`,
          details: { missing }
        },
        timestamp: new Date().toISOString()
      });
    }
  };
}