// src/utils/mandate-paths.ts
import path from 'path';

// MandateFsContext es el objeto que viaja por inyección de dependencias en
// todo api/: se arma una sola vez en server.ts (workspacePath + org) y se
// reenvía a mandates.routes.ts → assert-base-genesis-completed.hook.ts, etc.
// No renombrar/mover sin actualizar esos 3 call sites.
export interface MandateFsContext {
  workspacePath: string;
  org: string;
}

// mandatesRoot debe coincidir exactamente con cfg.MandatesRoot() en
// internal/supervisor (Go): <workspace_path>/.bloom/.nucleus-{org}/.mandates
export function mandatesRoot(fsCtx: MandateFsContext): string {
  return path.join(fsCtx.workspacePath, '.bloom', `.nucleus-${fsCtx.org}`, '.mandates');
}

/** Durable request journal kept outside .mandates so the Nucleus watcher never
 * mistakes idempotency metadata for a Mandate directory. */
export function genesisLaunchJournalRoot(fsCtx: MandateFsContext): string {
  return path.join(fsCtx.workspacePath, '.bloom', `.nucleus-${fsCtx.org}`, '.core', 'genesis-launches');
}

export function genesisLaunchJournalPath(fsCtx: MandateFsContext, mandateLaunchId: string): string {
  return path.join(genesisLaunchJournalRoot(fsCtx), `${mandateLaunchId}.json`);
}

// SIN punto adelante: mandate.go (Go) escribe la carpeta como
// filepath.Join(cfg.MandatesRoot(), mandateID) — sin prefijo "." en mandateID.
export function mandateDir(fsCtx: MandateFsContext, mandateId: string): string {
  return path.join(mandatesRoot(fsCtx), mandateId);
}

export function mandateJsonPath(fsCtx: MandateFsContext, mandateId: string): string {
  return path.join(mandateDir(fsCtx, mandateId), 'mandate.json');
}

export function mandateStatePath(fsCtx: MandateFsContext, mandateId: string): string {
  return path.join(mandateDir(fsCtx, mandateId), 'mandate_state.json');
}
