// backend/src/authority/genesis-store.ts
//
// Génesis / Primer Registro: Organización Personal por Defecto
// (Encargo_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md §2.3).
//
// Extiende aditivamente al lado de human-session-store.ts — nunca reabre
// beginHumanLogin/finishHumanLogin/authority_human_flows, que ya funcionan y tienen
// tests. Reusa issueSession/seal/open/cipherKey/timestamp/permitted, exportados de
// human-session-store.ts para este único propósito (§3 del encargo).

import { HumanIdentityError, hashSecret, randomSecret } from './human-identity';
import { cipherKey, issueSession, open, permitted, seal, timestamp, type HumanServices, type Identity } from './human-session-store';

export interface GenesisResult {
  token: string;
  csrf: string;
  sessionId: string;
  organizationId: string;
  principalId: string;
  expiresAt: string;
  created: boolean;
}

/** Igual que beginHumanLogin, pero sin organizationId: la organización todavía no
 * existe. Inserta en authority_genesis_flows (no en authority_human_flows) y reusa el
 * mismo provider (mismo GitHub App, mismo callbackUrl) — sin callback ni configuración
 * nueva. */
export async function beginGenesis(db: D1Database, s: HumanServices) {
  permitted(s); await cipherKey(s);
  const state = randomSecret(), browser = randomSecret(), verifier = randomSecret();
  await db.prepare('INSERT INTO authority_genesis_flows(state_hash,browser_hash,verifier,expires_at) VALUES(?,?,?,?)')
    .bind(await hashSecret(state), await hashSecret(browser), await seal(s, verifier, state), new Date(timestamp(s) + 300000).toISOString()).run();
  return { state, browser, url: s.provider.authorize(state, await hashSecret(verifier)) };
}

/** Emite sesión para una identidad de génesis ya existente (subject que vuelve a pasar
 * por génesis, o carrera resuelta a favor de otro request). Nunca asume: revalida
 * status/verified_at igual que finishHumanLogin. */
async function issueForIdentity(db: D1Database, organizationId: string, principalId: string, providerToken: string,
  absolute: string, s: HumanServices, created: boolean): Promise<GenesisResult> {
  const identity = await db.prepare('SELECT * FROM authority_human_identities WHERE organization_id=? AND principal_id=?')
    .bind(organizationId, principalId).first<Identity>();
  if (!identity || identity.status !== 'active' || !identity.verified_at) throw new HumanIdentityError('correspondence_missing');
  permitted(s, identity);
  const session = await issueSession(db, identity, providerToken, absolute, s);
  return { ...session, created };
}

/** Rama de creación (subject nuevo): tenant + organización + identidad canónica +
 * ancla de registry, todo en un único batch atómico. Extraída de finishGenesis sin
 * cambiar nada de su lógica — sólo para que finishGenesis tenga un único punto de
 * retorno donde persistir el resultado para el poll (§ más abajo). */
async function createOrganizationAndIssue(db: D1Database, human: { subject: string; handle: string },
  providerToken: string, absolute: string, s: HumanServices): Promise<GenesisResult> {
  const organizationId = crypto.randomUUID(), principalId = crypto.randomUUID(), now = s.now();
  // Sovereign Tenant, Fase 2 (Propuesta_Arquitectura_Tenant_Soberano_v0_1.md §2.3.1,
  // confirmada por Jose 2026-09-16): cada organización nueva nace ya perteneciendo a un
  // tenant propio. `tenantId` es un UUID independiente de `organizationId` a propósito —
  // a diferencia del backfill de Fase 1 (que reusó `organization.id` como `tenant.id`
  // para lo legado, sin tabla de traducción), acá no hay legado que reconciliar: cada
  // entidad recibe su propio id desde el origen. No se toca nada más de esta función —
  // el invariante "un subject, una organización, una sola vez" (authority_genesis_registry)
  // sigue exactamente igual, sólo se agrega el tenant a la misma transacción atómica.
  const tenantId = crypto.randomUUID(), createdAt = Date.now();
  try {
    // Atómico (db.batch, D1 todo-o-nada): tenant + organización + identidad canónica
    // (verificada en el momento mismo de la creación, no en dos pasos) + ancla de registry.
    await db.batch([
      db.prepare('INSERT INTO tenants(id,name,master_github_username,key_fingerprint,created_at) VALUES(?,?,?,?,?)')
        .bind(tenantId, human.handle, human.handle, 'unassigned', createdAt),
      db.prepare('INSERT INTO organizations(id,name,master_github_username,key_fingerprint,created_at,tenant_id) VALUES(?,?,?,?,?,?)')
        .bind(organizationId, human.handle, human.handle, 'unassigned', createdAt, tenantId),
      db.prepare(`INSERT INTO authority_human_identities(organization_id,principal_id,subject,source_ref,evidence_kind,revision,status,verified_at,display_handle)
        VALUES(?,?,?,'canonical:github','canonical','1','active',?,?)`).bind(organizationId, principalId, human.subject, now, human.handle),
      db.prepare('INSERT INTO authority_genesis_registry(subject,organization_id,principal_id,created_at) VALUES(?,?,?,?)')
        .bind(human.subject, organizationId, principalId, now),
    ]);
  } catch (error) {
    // Carrera real: dos requests simultáneos del mismo subject nuevo. El batch de D1 es
    // todo-o-nada, así que si el conflicto de PK en authority_genesis_registry hizo
    // fallar este batch, no queda ningún estado parcial (ni el tenant ni la organización
    // de este request quedaron creados) — se cae al camino de "ya existe", nunca se asume
    // éxito silencioso.
    const raced = await db.prepare('SELECT organization_id,principal_id FROM authority_genesis_registry WHERE subject=?')
      .bind(human.subject).first<{ organization_id: string; principal_id: string }>();
    if (!raced) throw error;
    return issueForIdentity(db, raced.organization_id, raced.principal_id, providerToken, absolute, s, false);
  }
  return issueForIdentity(db, organizationId, principalId, providerToken, absolute, s, true);
}

export async function finishGenesis(db: D1Database, input: { state: string; browser: string; code: string }, s: HumanServices): Promise<GenesisResult> {
  permitted(s); if (!input.state || !input.browser || !input.code) throw new HumanIdentityError('flow_invalid');
  const stateHash = await hashSecret(input.state), browserHash = await hashSecret(input.browser);
  const flow = await db.prepare(`UPDATE authority_genesis_flows SET consumed=1 WHERE state_hash=? AND browser_hash=? AND consumed=0
    AND julianday(expires_at)>julianday(?) RETURNING verifier`).bind(stateHash, browserHash, s.now()).first<{ verifier: string }>();
  if (!flow) throw new HumanIdentityError('flow_invalid');
  const grant = await s.provider.exchange(input.code, await open(s, flow.verifier, input.state));
  const human = await s.provider.identify(grant.token);
  const absolute = new Date(timestamp(s) + Math.min(grant.expiresIn, 28800) * 1000).toISOString();

  // Un GitHub subject = una organización personal, una sola vez (§2.1.2 del encargo).
  const registry = await db.prepare('SELECT organization_id,principal_id FROM authority_genesis_registry WHERE subject=?')
    .bind(human.subject).first<{ organization_id: string; principal_id: string }>();
  const result = registry
    ? await issueForIdentity(db, registry.organization_id, registry.principal_id, grant.token, absolute, s, false)
    : await createOrganizationAndIssue(db, human, grant.token, absolute, s);

  // Diseño P (Propuesta_Diseno_Retorno_Genesis_y_Hallazgo_Invitaciones_v0_1.md §3.2,
  // autorizada por Jose 2026-09-22): además del contrato HTTP directo de este callback
  // (ya en producción, usado hoy por `nucleus auth genesis`), persistimos una copia del
  // resultado en la misma fila para que un segundo consumidor (Conductor, vía
  // GET /v1/authority/genesis/result con el secreto `browser`, ver pollGenesisResult más
  // abajo) lo pueda leer exactamente una vez. También extendemos `expires_at` a partir de
  // ahora: la ventana original de 5 minutos medía "tiempo para completar el login en
  // GitHub", no "tiempo para que Conductor venga a buscar el resultado ya listo" — sin
  // este refresh, un login que tardó 4:50 en completarse dejaría sólo 10 segundos de
  // ventana de poll. Si esta escritura falla, el flujo entero falla (no se swallow-ea):
  // un fallo acá es un problema real de DB, y dejarlo pasar en silencio dejaría a
  // Conductor esperando un poll que nunca va a completarse, sin ningún indicio de por qué.
  await db.prepare('UPDATE authority_genesis_flows SET result_json=?,expires_at=? WHERE state_hash=? AND browser_hash=?')
    .bind(JSON.stringify(result), new Date(timestamp(s) + 120000).toISOString(), stateHash, browserHash).run();

  return result;
}

/**
 * Diseño P — lado de lectura. `browser` (el mismo secreto de 32 bytes que ya devuelve
 * beginGenesis a quien inicia el flujo) es la única prueba de posesión: no hace falta
 * sesión, no hace falta CSRF, mismo criterio que finishGenesis ya aplica a
 * `state`/`browser`/`verifier`. No distingue "no existe" de "expiró" de "todavía no
 * terminó" — mismo criterio anti-enumeración que el resto de authority_genesis_flows —
 * por eso devuelve `null` en los tres casos y deja que el caller (administration-route.ts)
 * responda siempre `202 pending` sin filtrar cuál fue.
 *
 * Entrega única: borra `result_json` en el mismo request que lo lee (mismo patrón que
 * `mandate/bootstrap` ya usa en este backend) — releer el mismo `browser` después de una
 * entrega exitosa vuelve a dar `null`, nunca repite el resultado.
 */
export async function pollGenesisResult(db: D1Database, browser: string, now: () => string): Promise<GenesisResult | null> {
  if (!browser) return null;
  const browserHash = await hashSecret(browser);
  const row = await db.prepare(`SELECT result_json FROM authority_genesis_flows
    WHERE browser_hash=? AND consumed=1 AND result_json IS NOT NULL AND julianday(expires_at)>julianday(?)`)
    .bind(browserHash, now()).first<{ result_json: string }>();
  if (!row) return null;
  await db.prepare('UPDATE authority_genesis_flows SET result_json=NULL WHERE browser_hash=?').bind(browserHash).run();
  return JSON.parse(row.result_json) as GenesisResult;
}
