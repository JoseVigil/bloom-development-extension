import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const CopilotChatSchema = z.object({
  message: z.string().min(1),
  context: z.object({
    route: z.string(),
    protocol: z.enum(['onboarding', 'genesis', 'dev', 'doc']),
    intentId: z.string().optional(),
    nucleusPath: z.string().optional()
  })
});

export async function copilotRoutes(fastify: FastifyInstance) {
  
  // POST /api/v1/copilot/chat (Server-Sent Events)
  fastify.post('/chat', {
    schema: {
      description: 'Stream AI Copilot chat responses',
      tags: ['copilot'],
      body: {
        type: 'object',
        required: ['message', 'context'],
        properties: {
          message: { type: 'string', description: 'User message' },
          context: {
            type: 'object',
            required: ['route', 'protocol'],
            properties: {
              route: { type: 'string', description: 'Current UI route' },
              protocol: { 
                type: 'string', 
                enum: ['onboarding', 'genesis', 'dev', 'doc'],
                description: 'Copilot protocol context'
              },
              intentId: { type: 'string', description: 'Intent ID (if applicable)' },
              nucleusPath: { type: 'string', description: 'Nucleus path (if applicable)' }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: z.infer<typeof CopilotChatSchema>
  }>, reply: FastifyReply) => {
    const validated = CopilotChatSchema.parse(request.body);
    
    // Set headers for SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    try {
      // Send start event
      reply.raw.write(`data: ${JSON.stringify({ 
        type: 'start', 
        timestamp: Date.now() 
      })}\n\n`);
      
      // Delegate to WebSocket manager's copilot handler
      const wsManager = (request as any).wsManager;
      
      // Mock streaming for now (will be replaced with actual Copilot logic)
      const mockResponse = `Response to: "${validated.message}" in ${validated.context.protocol} context`;
      
      // Simulate streaming chunks
      for (let i = 0; i < mockResponse.length; i += 10) {
        const chunk = mockResponse.slice(i, i + 10);
        reply.raw.write(`data: ${JSON.stringify({ 
          type: 'chunk', 
          chunk,
          done: false 
        })}\n\n`);
        
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Send completion event
      reply.raw.write(`data: ${JSON.stringify({ 
        type: 'end', 
        done: true,
        timestamp: Date.now() 
      })}\n\n`);
      
      reply.raw.end();
      
    } catch (error: any) {
      // Send error event
      reply.raw.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: error.message 
      })}\n\n`);
      
      reply.raw.end();
    }
  });
}