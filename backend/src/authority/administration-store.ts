import { canonicalizeJson, digestWire } from "./canonical";
import { normalizeMetadata, normalizeWireTime, wireVersion } from "./emission";
import { EmissionStoreError, loadCurrentEmission, prepareEmission, type EmissionSigner, type PreparedEmission } from "./emission-store";
import { AdministrationError, authorityInstant, evaluateAdministration,
  type AdministrationCommand, type AdministrationProposal, type ProjectEvidence, type VerifiedHumanActor, type InitialHumanIdentity } from "./administration";
import type { WireEmissionMetadata } from "./schema";

export interface AdministrationServices {
  // Mandatory trusted adapter. 2A has no HTTP entry point or fixture fallback.
  verifyActor: (proof: string, organizationId: string) => Promise<VerifiedHumanActor | null>;
  now: () => string;
  signer: EmissionSigner;
  allowTestFixtures?: boolean;
  initialIdentity?: (organizationId:string,principalId:string)=>Promise<InitialHumanIdentity|undefined>;
  commitGuard?: (actor:VerifiedHumanActor,requestId:string,at:string,recipient?:InitialHumanIdentity)=>D1PreparedStatement;
}
export interface AdministrationRequest {
  requestId: string; actorProof: string; expectedVersion: string;
  metadata: WireEmissionMetadata; command: AdministrationCommand;
}
export interface AdministrationResult {
  requestId: string; authorityVersion: string; stateDigest: string;
  operation: string; proposalId: string | null; status: "pending" | "committed";
}

/** All authoritative facts live in the immutable emission; pending proposals are
 * not assignments/memberships and carry no invented accepted_at. */
export async function administerAuthority(db: D1Database, request: AdministrationRequest,
  services: AdministrationServices): Promise<AdministrationResult> {
  if (!request.requestId || typeof request.requestId !== "string" || !request.actorProof
    || !services.verifyActor || !services.now) throw new AdministrationError("invalid_request");
  const metadata = normalizeMetadata(request.metadata), org = metadata.organization_id;
  if (wireVersion(metadata.authority_version) !== wireVersion(request.expectedVersion)+1n) throw new AdministrationError("version_conflict");
  const actor = await services.verifyActor(request.actorProof,org);
  if(actor?.source==='backend-session'&&!services.commitGuard)throw new AdministrationError('session_guard_required');
  const validActor = (now: string) => {
    if (!actor || actor.organizationId !== org || !actor.principalId || !actor.sessionId
      || authorityInstant(actor.expiresAt) <= authorityInstant(now)
      || !["backend-session","test-fixture"].includes(actor.source)
      || (actor.source === "test-fixture" && services.allowTestFixtures !== true)) throw new AdministrationError("actor_unverified");
  };
  validActor(services.now());
  const command = structuredClone(request.command);
  const requestDigest = await digestWire({actor_id:actor!.principalId,expected_version:request.expectedVersion,metadata,command});
  const session = db.withSession("first-primary");
  const retry = async (): Promise<AdministrationResult|null> => {
    const row = await session.prepare("SELECT request_digest, actor_id, result_json FROM authority_admin_requests WHERE organization_id=? AND request_id=?")
      .bind(org,request.requestId).first<{request_digest:string;actor_id:string;result_json:string}>();
    if (!row) return null;
    if (row.actor_id !== actor!.principalId || row.request_digest !== requestDigest) throw new AdministrationError("idempotency_conflict");
    return JSON.parse(row.result_json) as AdministrationResult;
  };
  const existing = await retry(); if (existing) return existing;
  const current = await loadCurrentEmission(db,org);
  if (!current) throw new AdministrationError("onboarding_unavailable");
  if (current.metadata.authority_version !== request.expectedVersion) {
    const raced = await retry(); if (raced) return raced;
    throw new AdministrationError("version_conflict");
  }
  let proposal: AdministrationProposal|undefined;
  if (command.kind === "accept") {
    const row = await session.prepare("SELECT proposal_id, grantor_id, recipient_id, body_json, status FROM authority_admin_proposals WHERE organization_id=? AND proposal_id=?")
      .bind(org,command.proposalId).first<{proposal_id:string;grantor_id:string;recipient_id:string;body_json:string;status:"pending"|"accepted"}>();
    if (row) proposal={proposalId:row.proposal_id,grantorId:row.grantor_id,recipientId:row.recipient_id,body:JSON.parse(row.body_json),status:row.status};
  }
  const projectRows = await session.prepare("SELECT * FROM authority_project_scope_evidence WHERE organization_id=?").bind(org).all<ProjectEvidence>();
  const decisionTime = normalizeWireTime(services.now());validActor(decisionTime);
  if (authorityInstant(metadata.issued_at)>authorityInstant(decisionTime) || authorityInstant(metadata.not_before)>authorityInstant(decisionTime)
    || authorityInstant(metadata.expires_at)<=authorityInstant(decisionTime)) throw new AdministrationError("invalid_emission_time");
  const context={organizationId:org,authorityVersion:metadata.authority_version,now:decisionTime,effectiveAt:decisionTime,revocationId:`admin:${request.requestId}`,
    projects:projectRows.results,allowTestFixtures:services.allowTestFixtures===true,proposal,
    initialIdentity:command.kind==='propose_membership'&&!current.state.principals.some(p=>p.principal_id===command.principalId)
      ?await services.initialIdentity?.(org,command.principalId):undefined};
  const plan = evaluateAdministration(current.state,actor!,command,context);
  const result: AdministrationResult={requestId:request.requestId,authorityVersion:metadata.authority_version,stateDigest:await digestWire(plan.state),
    operation:command.kind,proposalId:plan.proposal?.proposalId??plan.consumedProposalId??null,status:plan.proposal?"pending":"committed"};
  let prepared: PreparedEmission;
  try {
    prepared = await prepareEmission(db,{requestId:`admin:${request.requestId}`,expectedVersion:request.expectedVersion,metadata,state:plan.state},services.signer);
  } catch(error) {
    const raced = await retry(); if(raced)return raced;
    if(error instanceof EmissionStoreError && error.code === "cas_conflict")throw new AdministrationError("version_conflict");
    throw error;
  }
  if (!prepared.statement) {
    const completed = await retry();if (completed) return completed;
    throw new AdministrationError("incomplete_commit");
  }
  // Re-evaluate time-dependent authorization after asynchronous reads/signing.
  // The DB CAS pins the immutable authority facts; project revisions are guarded below.
  const commitTime = normalizeWireTime(services.now());validActor(commitTime);
  const finalPlan = evaluateAdministration(current.state,actor!,command,{...context,now:commitTime});
  if (canonicalizeJson(finalPlan.state)!==canonicalizeJson(plan.state)) {
    // Never commit a signature for a different authority projection.
    throw new AdministrationError("decision_time_changed");
  }
  if (authorityInstant(metadata.expires_at)<=authorityInstant(commitTime)) throw new AdministrationError("invalid_emission_time");
  const statements: D1PreparedStatement[]=[prepared.statement,
    session.prepare(`INSERT INTO authority_admin_requests
      (organization_id,request_id,request_digest,actor_id,operation,base_version,authority_version,decided_at,
       command_json,result_json,proposal_id,consumed_proposal_id,project_checks_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(org,request.requestId,requestDigest,actor!.principalId,command.kind,request.expectedVersion,metadata.authority_version,commitTime,
        canonicalizeJson(command),canonicalizeJson(result),plan.proposal?.proposalId??null,plan.consumedProposalId??null,canonicalizeJson(plan.projectChecks))];
  if (plan.proposal) {
    const p=plan.proposal;
    statements.push(session.prepare(`INSERT INTO authority_admin_proposals
      (organization_id,proposal_id,grantor_id,recipient_id,body_json,created_version,accepted_version,status) VALUES (?,?,?,?,?,?,NULL,'pending')`)
      .bind(org,p.proposalId,p.grantorId,p.recipientId,canonicalizeJson(p.body),metadata.authority_version));
  }
  if (plan.consumedProposalId) statements.push(session.prepare(`UPDATE authority_admin_proposals SET status='accepted',accepted_version=?
    WHERE organization_id=? AND proposal_id=? AND status='pending'`).bind(metadata.authority_version,org,plan.consumedProposalId));
  statements.push(session.prepare(`INSERT INTO authority_admin_audit
    (organization_id,request_id,actor_id,operation,before_version,after_version,at,details_json) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(org,request.requestId,actor!.principalId,command.kind,request.expectedVersion,metadata.authority_version,commitTime,
      canonicalizeJson({command,proposal:plan.proposal??proposal??null,project_checks:plan.projectChecks,identity_source:actor!.source,session_id:actor!.sessionId})));
  statements.push(session.prepare(`INSERT INTO authority_admin_outbox
    (organization_id,event_id,authority_version,payload_json,created_at,delivered_at) VALUES (?,?,?,?,?,NULL)`)
    .bind(org,request.requestId,metadata.authority_version,canonicalizeJson({organization_id:org,authority_version:metadata.authority_version,
      state_digest:result.stateDigest,urgency:command.kind.startsWith("revoke_")||command.kind.startsWith("suspend_")?"revocation":"routine",correlation_id:request.requestId}),commitTime));
  if(services.commitGuard)statements.push(services.commitGuard(actor!,request.requestId,commitTime,context.initialIdentity));
  try {await session.batch(statements);} catch(error) {
    const raced=await retry();if(raced)return raced;
    if (String(error).includes("authority_cas_conflict") || String(error).includes("authority_admin_head_conflict")) throw new AdministrationError("version_conflict");
    if (String(error).includes("authority_proposal_conflict")) throw new AdministrationError("proposal_conflict");
    if (String(error).includes("authority_scope_conflict")) throw new AdministrationError("scope_conflict");
    if (String(error).includes("authority_session_conflict")) throw new AdministrationError("session_conflict");
    if (String(error).includes("authority_identity_conflict")) throw new AdministrationError("identity_conflict");
    throw error;
  }
  return result;
}
