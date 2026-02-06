// nucleus-server.js
// Autonomous Node.js server for Bloom Nucleus with Process Orchestration
// Runs independently from VS Code extension context

const fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const fastifySwagger = require('@fastify/swagger');
const fastifySwaggerUi = require('@fastify/swagger-ui');
const fastifyWebsocket = require('@fastify/websocket');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const value = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true;
    acc[key] = value;
  }
  return acc;
}, {});

const PORT = parseInt(args.port) || 48215;
const NUCLEUS_PATH = args['nucleus-path'] || process.cwd();
const BLOOM_DIR = path.join(NUCLEUS_PATH, '.bloom');
const DEV_MODE = args.dev === true || args.dev === 'true';

// Process registry
const childProcesses = {
  svelte: null,
  vscode: null
};

// Initialize Fastify
const app = fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
});

// Swagger configuration
app.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'Bloom Nucleus API',
      description: 'REST API for Bloom AI Assistant System with Process Orchestration',
      version: '1.0.0'
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Local Nucleus Server'
      }
    ],
    tags: [
      { name: 'health', description: 'Health check endpoints' },
      { name: 'intents', description: 'Intent management' },
      { name: 'context', description: 'Editor context and state' },
      { name: 'telemetry', description: 'Telemetry and logging' },
      { name: 'processes', description: 'Process management' }
    ]
  }
});

app.register(fastifySwaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  }
});

// WebSocket support
app.register(fastifyWebsocket);

// Ensure .bloom directory exists
async function ensureBloomDirectory() {
  try {
    await fs.access(BLOOM_DIR);
  } catch {
    await fs.mkdir(BLOOM_DIR, { recursive: true });
    app.log.info(`Created .bloom directory at ${BLOOM_DIR}`);
  }
}

// WebSocket connections registry
const wsConnections = new Set();

// WebSocket route for telemetry streaming
app.register(async function (fastify) {
  fastify.get('/ws/telemetry', { websocket: true }, (connection, req) => {
    wsConnections.add(connection);
    
    connection.socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        fastify.log.info({ type: 'ws-message', data }, 'WebSocket message received');
      } catch (err) {
        fastify.log.error({ err }, 'Invalid WebSocket message');
      }
    });

    connection.socket.on('close', () => {
      wsConnections.delete(connection);
      fastify.log.info('WebSocket connection closed');
    });

    connection.socket.send(JSON.stringify({
      type: 'connected',
      server: 'nucleus',
      timestamp: new Date().toISOString()
    }));
  });
});

// Broadcast to all WebSocket clients
function broadcastTelemetry(event) {
  const message = JSON.stringify({
    ...event,
    timestamp: new Date().toISOString()
  });
  
  for (const connection of wsConnections) {
    try {
      connection.socket.send(message);
    } catch (err) {
      app.log.error({ err }, 'Failed to send WebSocket message');
    }
  }
}

// Start Svelte UI process
function startSvelteProcess() {
  const uiPath = path.join(NUCLEUS_PATH, 'ui');
  
  app.log.info(`Starting Svelte UI from ${uiPath}`);
  
  const svelteProcess = spawn('npm', ['run', 'dev'], {
    cwd: uiPath,
    shell: true,
    env: { ...process.env }
  });

  childProcesses.svelte = svelteProcess;

  svelteProcess.stdout.on('data', (data) => {
    const output = data.toString();
    app.log.info({ service: 'svelte' }, output.trim());
    
    broadcastTelemetry({
      type: 'svelte-output',
      output: output.trim(),
      pid: svelteProcess.pid
    });
  });

  svelteProcess.stderr.on('data', (data) => {
    const output = data.toString();
    app.log.error({ service: 'svelte' }, output.trim());
    
    broadcastTelemetry({
      type: 'svelte-error',
      output: output.trim(),
      pid: svelteProcess.pid
    });
  });

  svelteProcess.on('close', (code) => {
    app.log.info(`Svelte process exited with code ${code}`);
    childProcesses.svelte = null;
    
    broadcastTelemetry({
      type: 'svelte-closed',
      exitCode: code
    });
  });

  svelteProcess.on('error', (err) => {
    app.log.error({ err }, 'Failed to start Svelte process');
    childProcesses.svelte = null;
  });

  return svelteProcess;
}

// Start VS Code process (dev mode only)
function startVSCodeProcess() {
  if (!DEV_MODE) {
    app.log.info('VS Code dev mode not enabled (--dev flag not set)');
    return null;
  }

  const extensionPath = NUCLEUS_PATH;
  
  app.log.info(`Starting VS Code with extension development path: ${extensionPath}`);
  
  const vscodeProcess = spawn('code', [
    `--extensionDevelopmentPath=${extensionPath}`
  ], {
    shell: true,
    env: { ...process.env }
  });

  childProcesses.vscode = vscodeProcess;

  vscodeProcess.stdout.on('data', (data) => {
    const output = data.toString();
    app.log.info({ service: 'vscode' }, output.trim());
    
    broadcastTelemetry({
      type: 'vscode-output',
      output: output.trim(),
      pid: vscodeProcess.pid
    });
  });

  vscodeProcess.stderr.on('data', (data) => {
    const output = data.toString();
    app.log.error({ service: 'vscode' }, output.trim());
    
    broadcastTelemetry({
      type: 'vscode-error',
      output: output.trim(),
      pid: vscodeProcess.pid
    });
  });

  vscodeProcess.on('close', (code) => {
    app.log.info(`VS Code process exited with code ${code}`);
    childProcesses.vscode = null;
    
    broadcastTelemetry({
      type: 'vscode-closed',
      exitCode: code
    });
  });

  vscodeProcess.on('error', (err) => {
    app.log.error({ err }, 'Failed to start VS Code process');
    childProcesses.vscode = null;
  });

  return vscodeProcess;
}

// Kill all child processes
function killAllChildProcesses() {
  app.log.info('Killing all child processes...');
  
  if (childProcesses.svelte) {
    try {
      process.kill(childProcesses.svelte.pid, 'SIGTERM');
      app.log.info(`Killed Svelte process (PID: ${childProcesses.svelte.pid})`);
    } catch (err) {
      app.log.error({ err }, 'Failed to kill Svelte process');
    }
  }

  if (childProcesses.vscode) {
    try {
      process.kill(childProcesses.vscode.pid, 'SIGTERM');
      app.log.info(`Killed VS Code process (PID: ${childProcesses.vscode.pid})`);
    } catch (err) {
      app.log.error({ err }, 'Failed to kill VS Code process');
    }
  }
}

// Health check endpoint with process status
app.get('/health', {
  schema: {
    tags: ['health'],
    description: 'Health check endpoint with subprocess status',
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          service: { type: 'string' },
          port: { type: 'number' },
          nucleusPath: { type: 'string' },
          uptime: { type: 'number' },
          timestamp: { type: 'string' },
          processes: {
            type: 'object',
            properties: {
              svelte: {
                type: 'object',
                properties: {
                  running: { type: 'boolean' },
                  pid: { type: ['number', 'null'] }
                }
              },
              vscode: {
                type: 'object',
                properties: {
                  running: { type: 'boolean' },
                  pid: { type: ['number', 'null'] }
                }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  return {
    status: 'healthy',
    service: 'nucleus-server',
    port: PORT,
    nucleusPath: NUCLEUS_PATH,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    processes: {
      svelte: {
        running: childProcesses.svelte !== null,
        pid: childProcesses.svelte?.pid || null
      },
      vscode: {
        running: childProcesses.vscode !== null,
        pid: childProcesses.vscode?.pid || null
      }
    }
  };
});

// Get process status
app.get('/api/processes/status', {
  schema: {
    tags: ['processes'],
    description: 'Get status of all managed processes'
  }
}, async (request, reply) => {
  return {
    svelte: {
      running: childProcesses.svelte !== null,
      pid: childProcesses.svelte?.pid || null
    },
    vscode: {
      running: childProcesses.vscode !== null,
      pid: childProcesses.vscode?.pid || null,
      devMode: DEV_MODE
    }
  };
});

// Restart Svelte process
app.post('/api/processes/svelte/restart', {
  schema: {
    tags: ['processes'],
    description: 'Restart Svelte UI process'
  }
}, async (request, reply) => {
  if (childProcesses.svelte) {
    process.kill(childProcesses.svelte.pid, 'SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  startSvelteProcess();
  
  return { success: true, message: 'Svelte process restarted' };
});

// Get all intents
app.get('/api/intents', {
  schema: {
    tags: ['intents'],
    description: 'Get all intents from .bloom directory',
    response: {
      200: {
        type: 'object',
        properties: {
          intents: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                content: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }
}, async (request, reply) => {
  try {
    const files = await fs.readdir(BLOOM_DIR);
    const intentFiles = files.filter(f => f.endsWith('.intent.json'));
    
    const intents = await Promise.all(
      intentFiles.map(async (file) => {
        const filePath = path.join(BLOOM_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        return {
          id: file.replace('.intent.json', ''),
          name: file,
          content: JSON.parse(content)
        };
      })
    );
    
    return { intents };
  } catch (err) {
    app.log.error({ err }, 'Failed to read intents');
    reply.code(500).send({ error: 'Failed to read intents' });
  }
});

// Get specific intent
app.get('/api/intents/:id', {
  schema: {
    tags: ['intents'],
    description: 'Get a specific intent by ID',
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { id } = request.params;
    const filePath = path.join(BLOOM_DIR, `${id}.intent.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    
    return {
      id,
      content: JSON.parse(content)
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      reply.code(404).send({ error: 'Intent not found' });
    } else {
      app.log.error({ err }, 'Failed to read intent');
      reply.code(500).send({ error: 'Failed to read intent' });
    }
  }
});

// Create or update intent
app.post('/api/intents/:id', {
  schema: {
    tags: ['intents'],
    description: 'Create or update an intent',
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      }
    },
    body: {
      type: 'object'
    }
  }
}, async (request, reply) => {
  try {
    const { id } = request.params;
    const filePath = path.join(BLOOM_DIR, `${id}.intent.json`);
    
    await fs.writeFile(
      filePath,
      JSON.stringify(request.body, null, 2),
      'utf-8'
    );
    
    broadcastTelemetry({
      type: 'intent-updated',
      intentId: id
    });
    
    return {
      success: true,
      id,
      path: filePath
    };
  } catch (err) {
    app.log.error({ err }, 'Failed to write intent');
    reply.code(500).send({ error: 'Failed to write intent' });
  }
});

// Delete intent
app.delete('/api/intents/:id', {
  schema: {
    tags: ['intents'],
    description: 'Delete an intent',
    params: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  try {
    const { id } = request.params;
    const filePath = path.join(BLOOM_DIR, `${id}.intent.json`);
    
    await fs.unlink(filePath);
    
    broadcastTelemetry({
      type: 'intent-deleted',
      intentId: id
    });
    
    return {
      success: true,
      id
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      reply.code(404).send({ error: 'Intent not found' });
    } else {
      app.log.error({ err }, 'Failed to delete intent');
      reply.code(500).send({ error: 'Failed to delete intent' });
    }
  }
});

// Editor context endpoint (for VS Code extension client)
app.post('/api/context/editor', {
  schema: {
    tags: ['context'],
    description: 'Receive editor context from VS Code extension',
    body: {
      type: 'object',
      properties: {
        activeFile: { type: 'string' },
        selection: { type: 'object' },
        language: { type: 'string' },
        workspace: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  broadcastTelemetry({
    type: 'editor-context',
    data: request.body
  });
  
  return { received: true };
});

// Get telemetry log
app.get('/api/telemetry/log', {
  schema: {
    tags: ['telemetry'],
    description: 'Get current telemetry log path',
    response: {
      200: {
        type: 'object',
        properties: {
          logPath: { type: 'string' },
          exists: { type: 'boolean' }
        }
      }
    }
  }
}, async (request, reply) => {
  const logPath = path.join(
    process.env.LOCALAPPDATA || process.env.APPDATA,
    'BloomNucleus',
    'logs',
    'telemetry.json'
  );
  
  try {
    await fs.access(logPath);
    return { logPath, exists: true };
  } catch {
    return { logPath, exists: false };
  }
});

// Graceful shutdown
async function gracefulShutdown() {
  app.log.info('Shutting down gracefully...');
  
  killAllChildProcesses();
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server and child processes
async function start() {
  try {
    await ensureBloomDirectory();
    await app.listen({ port: PORT, host: '0.0.0.0' });
    
    app.log.info(`🚀 Nucleus Server running on http://localhost:${PORT}`);
    app.log.info(`📚 API Documentation: http://localhost:${PORT}/docs`);
    app.log.info(`📁 Nucleus Path: ${NUCLEUS_PATH}`);
    app.log.info(`🎯 Bloom Directory: ${BLOOM_DIR}`);
    app.log.info(`🔧 Dev Mode: ${DEV_MODE ? 'ENABLED' : 'DISABLED'}`);
    
    broadcastTelemetry({
      type: 'server-started',
      port: PORT,
      nucleusPath: NUCLEUS_PATH,
      devMode: DEV_MODE
    });

    // Start child processes
    app.log.info('Starting child processes...');
    startSvelteProcess();
    
    if (DEV_MODE) {
      startVSCodeProcess();
    }
    
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();