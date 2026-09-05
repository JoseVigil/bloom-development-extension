import pino from 'pino';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import type { OrganizationContext } from '../utils/org-resolver.js';
import type { PathResolver } from '../config/paths.js';

export type LogStreamName = 'governance' | 'security' | 'relay';

export interface BatcaveLoggers {
  governance: pino.Logger;
  security: pino.Logger;
  relay: pino.Logger;
}

/** YYYY-MM-DD, mismo formato que ya usan `paths.*Log(date)`. */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

function createStream(
  org: OrganizationContext,
  logFilePath: string,
  logType: LogStreamName
): pino.Logger {
  // `paths.*Log()` ya resuelve el path completo; acá sólo garantizamos que el
  // directorio exista antes de que pino intente abrir el archivo.
  mkdirSync(dirname(logFilePath), { recursive: true });

  return pino(
    {
      level: process.env.LOG_LEVEL || 'info',
      // Cada entry queda tageado con organization/fingerprint, igual que exige
      // BATCAVE_ARCHITECTURE.md §8. log_type identifica el stream dentro del archivo.
      base: {
        organization: org.name,
        fingerprint: org.fingerprint,
        log_type: logType
      }
    },
    // sync:true — estos son streams de auditoría (governance/security/relay);
    // preferimos escritura determinística antes que throughput.
    pino.destination({ dest: logFilePath, mkdir: true, sync: true })
  );
}

/**
 * Crea las tres instancias pino (governance, security, relay) de Batcave para
 * la organización dada, cada una escribiendo al archivo de hoy resuelto por
 * `PathResolver` (§1.4 del encargo). No es el logger de Nucleus — logging propio
 * de Batcave, per BATCAVE_ARCHITECTURE.md §8.
 */
export function createBatcaveLoggers(
  org: OrganizationContext,
  paths: PathResolver
): BatcaveLoggers {
  const date = today();
  return {
    governance: createStream(org, paths.governanceLog(date), 'governance'),
    security: createStream(org, paths.securityLog(date), 'security'),
    relay: createStream(org, paths.relayLog(date), 'relay')
  };
}
