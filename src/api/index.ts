/**
 * API Module Entry Point
 * Exports Fastify server creation and management functions
 */

export { createAPIServer, startAPIServer, stopAPIServer } from './server';
export type { BloomApiServerConfig } from './server';
export { BrainApiAdapter } from './adapters/BrainApiAdapter';