import * as path from 'node:path';
import type { GenesisBackendRoot } from './windows-genesis-backend-root';

export interface Gate2Api {
  post(payload: Record<string,unknown>): Promise<{statusCode:number; body:string; json(): Record<string,unknown>}>;
  events: Array<{event:string; data:unknown}>;
  close(): Promise<void>;
}

/** Runs the real Fastify route in-process against only the disposable tree. */
export async function openGate2Api(fixture: GenesisBackendRoot): Promise<Gate2Api> {
  const root=path.resolve(__dirname,'../../..');
  // Runtime require keeps the app's source outside Runner's separate TS rootDir.
  const Fastify=require(path.join(root,'node_modules','fastify')) as typeof import('fastify');
  const schemas=require(path.join(root,'src','api','schemas','create-mandate.schema.ts')) as Record<string,unknown>;
  const {registerMandateRoutes}=require(path.join(root,'src','api','routes','mandates.routes.ts')) as {
    registerMandateRoutes:(server: unknown,deps:unknown)=>void;
  };
  const {WebSocketManager}=require(path.join(root,'src','server','WebSocketManager.ts')) as {
    WebSocketManager:{getInstance():{broadcast(event:string,data:unknown):void}};
  };
  const manager=WebSocketManager.getInstance();
  const original=manager.broadcast;
  const events: Gate2Api['events']=[];
  manager.broadcast=function(event:string,data:unknown):void {
    if (event==='mandate:build:initiated') events.push({event,data});
    original.call(manager,event,data);
  };
  const prior=process.env.BLOOM_NUCLEUS_PATH;
  process.env.BLOOM_NUCLEUS_PATH=fixture.workspace;
  const server=Fastify({ajv:{plugins:[(ajv:any)=>ajv.addKeyword({keyword:'discriminator'})]}});
  try {
    for (const name of ['StandardCreateBody','GenesisCreateBody','DomainExpansionCreateBody']) server.addSchema(schemas[name] as any);
    registerMandateRoutes(server,{fsCtx:{workspacePath:fixture.workspace,org:'runner-core-gate2'}});
    await server.ready();
  } catch (error) {
    manager.broadcast=original;
    if (prior===undefined) delete process.env.BLOOM_NUCLEUS_PATH; else process.env.BLOOM_NUCLEUS_PATH=prior;
    await server.close();
    throw error;
  }
  return {
    events,
    post:payload=>server.inject({method:'POST',url:'/mandates',payload}),
    close:async()=>{
      await server.close();
      manager.broadcast=original;
      if (prior===undefined) delete process.env.BLOOM_NUCLEUS_PATH; else process.env.BLOOM_NUCLEUS_PATH=prior;
    },
  };
}
