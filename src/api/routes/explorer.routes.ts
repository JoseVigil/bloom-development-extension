import type { FastifyPluginAsync } from 'fastify';
import { explorerSchemas } from '../schemas/explorer.schema';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

interface BTIPNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: BTIPNode[];
}

export const explorerRoutes: FastifyPluginAsync = async (fastify) => {
  
  // GET /api/v1/explorer/tree
  fastify.get('/tree', {
    schema: explorerSchemas.tree
  }, async (request, reply) => {
    const { path: requestedPath } = request.query as { path?: string };
    
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      return reply.code(404).send({
        error: 'No workspace found'
      });
    }

    const fullPath = path.join(workspacePath, '.bloom', requestedPath || '');
    
    try {
      const tree = await buildTree(fullPath);
      return tree;
    } catch (error: any) {
      return reply.code(500).send({
        error: error.message || 'Failed to build tree'
      });
    }
  });

  // GET /api/v1/explorer/file
  fastify.get('/file', {
    schema: explorerSchemas.file
  }, async (request, reply) => {
    const { path: filePath } = request.query as { path: string };
    
    if (!filePath) {
      return reply.code(400).send({
        error: 'Path parameter required'
      });
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();
      
      return {
        path: filePath,
        content,
        extension: ext
      };
    } catch (error: any) {
      return reply.code(500).send({
        error: error.message || 'Failed to read file'
      });
    }
  });

  // POST /api/v1/explorer/refresh
  fastify.post('/refresh', {
    schema: explorerSchemas.refresh
  }, async (request, reply) => {
    const deps = (fastify as any).deps;
    deps.wsManager?.broadcast('btip:updated', { path: null });
    
    return { success: true };
  });
};

/**
 * Build directory tree recursively
 */
async function buildTree(dirPath: string): Promise<BTIPNode[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: BTIPNode[] = [];
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const node: BTIPNode = {
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? 'directory' : 'file'
      };
      
      if (entry.isDirectory()) {
        node.children = await buildTree(fullPath);
      }
      
      nodes.push(node);
    }
    
    return nodes.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === 'directory' ? -1 : 1;
    });
  } catch (error) {
    return [];
  }
}