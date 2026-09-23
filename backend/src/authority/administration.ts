import { normalizeState, normalizeWireTime, withBuiltinCatalog, wireVersion } from "./emission";
import type { WireFullContent, WireMembership, WireRoleAssignment, WireRoleDefinition, WirePrincipal } from "./schema";

export class AdministrationError extends Error {
  constructor(readonly code: string) { super(`authority_admin_${code}`); }
}
const deny = (code: string): never => { throw new AdministrationError(code); };
export interface VerifiedHumanActor {
  organizationId: string; principalId: string; sessionId: string; expiresAt: string;
  source: "backend-session" | "test-fixture";
}
export interface ProjectEvidence {
  organization_id: string; project_id: string; revision: string; source_ref: string;
  evidence_kind: "canonical" | "test-fixture"; status: "active" | "revoked"; valid_until: string;
}
type Window = { validFrom: string; validUntil: string | null };
export type MembershipProposalCommand = Window & {
  kind: "propose_membership"; proposalId: string; membershipId: string; principalId: string;
};
export type AssignmentProposalCommand = Window & {
  kind: "propose_assignment"; proposalId: string; assignmentId: string; membershipId: string;
  roleId: string; roleVersion: string; scope: WireRoleAssignment["scope"];
};
export type ProposalCommand = MembershipProposalCommand | AssignmentProposalCommand;
export type AdministrationCommand = ProposalCommand | { kind: "accept"; proposalId: string }
  | { kind: "define_role"; role: WireRoleDefinition }
  | { kind: "suspend_membership" | "resume_membership" | "revoke_membership"; membershipId: string }
  | { kind: "suspend_assignment" | "resume_assignment" | "revoke_assignment"; assignmentId: string };
export interface AdministrationProposal {
  proposalId: string; grantorId: string; recipientId: string; body: ProposalCommand;
  status: "pending" | "accepted";
}
export interface AdministrationContext {
  organizationId: string; authorityVersion: string; now: string; revocationId: string;
  effectiveAt?: string;
  projects: ProjectEvidence[]; allowTestFixtures: boolean; proposal?: AdministrationProposal;
  initialIdentity?: InitialHumanIdentity;
}
export interface InitialHumanIdentity {organizationId:string;revision:string;source:'canonical'|'test-fixture';principal:WirePrincipal;}
export interface AdministrationPlan {
  state: WireFullContent; proposal?: AdministrationProposal; consumedProposalId?: string;
  projectChecks: ProjectEvidence[];
}

export function authorityInstant(value: string): bigint {
  const s = normalizeWireTime(value);
  return BigInt(new Date(s.slice(0,19) + "Z").getTime()) * 1000000n
    + BigInt((s.slice(19,-1).replace(".", "") + "000000000").slice(0,9));
}
function keys(value: unknown, expected: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== expected.length || expected.some(k => !Object.hasOwn(value,k))) deny("invalid_command");
}
function id(value: unknown) { if (typeof value !== "string" || !value.length) deny("invalid_command"); }
function validateCommand(command: AdministrationCommand) {
  if (!command || typeof command !== "object") deny("invalid_command");
  switch(command.kind) {
    case "propose_membership": keys(command,["kind","proposalId","membershipId","principalId","validFrom","validUntil"]);id(command.proposalId);id(command.membershipId);id(command.principalId);break;
    case "propose_assignment": keys(command,["kind","proposalId","assignmentId","membershipId","roleId","roleVersion","scope","validFrom","validUntil"]);id(command.proposalId);id(command.assignmentId);id(command.membershipId);id(command.roleId);wireVersion(command.roleVersion);keys(command.scope,["type","id"]);id(command.scope.id);break;
    case "accept": keys(command,["kind","proposalId"]);id(command.proposalId);break;
    case "define_role": keys(command,["kind","role"]);break;
    case "suspend_membership": case "resume_membership": case "revoke_membership": keys(command,["kind","membershipId"]);id(command.membershipId);break;
    case "suspend_assignment": case "resume_assignment": case "revoke_assignment": keys(command,["kind","assignmentId"]);id(command.assignmentId);break;
    default: deny("operation_unavailable");
  }
}

/** Pure policy. Actor verification and canonical project evidence are mandatory
 * trusted inputs, never assertions accepted from an HTTP request. */
export function evaluateAdministration(input: WireFullContent, actor: VerifiedHumanActor,
  commandInput: AdministrationCommand, context: AdministrationContext): AdministrationPlan {
  const org = context.organizationId, now = authorityInstant(context.now);
  const effectiveAt = normalizeWireTime(context.effectiveAt ?? context.now);
  if (authorityInstant(effectiveAt) > now) deny("invalid_decision_time");
  // R1 (Propuesta_Diseno_Resolucion_AsignacionRolesBuiltin_v0_1.md §4.1): toda decisión se
  // evalúa, y todo estado se emite, con el catálogo builtin completo. Sólo agrega definiciones;
  // no otorga nada — grantable/selfGrant/scopeVerified siguen decidiendo (R4).
  const state = normalizeState(withBuiltinCatalog(normalizeState(input, org)), org), command = structuredClone(commandInput);
  validateCommand(command); wireVersion(context.authorityVersion);
  if (!actor || actor.organizationId !== org || !actor.sessionId || authorityInstant(actor.expiresAt) <= now
    || !["backend-session","test-fixture"].includes(actor.source)
    || (actor.source === "test-fixture" && !context.allowTestFixtures)) deny("actor_unverified");
  const human = (principalId: string) => {
    const p = state.principals.find(p => p.principal_id === principalId);
    if (!p || p.principal_type !== "human" || p.status !== "active"
      || !p.external_identities.some(e => e.status === "verified" && authorityInstant(e.verified_at) <= now)) deny("human_unavailable");
  };
  human(actor.principalId);
  const revoked = (kind: string, target: string) => state.revocations.some(r => r.target_type === kind && r.target_id === target && authorityInstant(r.effective_at) <= now);
  const historicalRevocation = (kind: string, target: string) => state.revocations.some(r => r.target_type === kind && r.target_id === target);
  const current = (v: {status:string;valid_from:string;valid_until:string|null;accepted_at:string}) => v.status === "active"
    && authorityInstant(v.valid_from) <= now && (v.valid_until === null || authorityInstant(v.valid_until) > now) && authorityInstant(v.accepted_at) <= now;
  const memberActive = (m: WireMembership) => current(m) && !revoked("membership",m.membership_id);
  const roleFor = (id: string, version: string) => {
    const r = state.role_definitions.find(r => r.role_id === id && r.role_version === version);
    if (!r || r.status !== "active" || revoked("role_definition",id)) return null;
    return r;
  };
  const activeAssignments = (principalId: string, scope: WireRoleAssignment["scope"]) => state.role_assignments.filter(a => {
    const m = state.memberships.find(m => m.membership_id === a.membership_id && m.principal_id === principalId);
    return m && memberActive(m) && current(a) && !revoked("role_assignment",a.assignment_id)
      && a.scope.type === scope.type && a.scope.id === scope.id && roleFor(a.role_id,a.role_version);
  });
  const permissions = (principalId: string, scope: WireRoleAssignment["scope"]) => new Set(activeAssignments(principalId,scope).flatMap(a => roleFor(a.role_id,a.role_version)!.permissions));
  const orgScope = { type: "organization" as const, id: org };
  const requirePermission = (principalId: string, permission: string) => {
    human(principalId);
    if (!permissions(principalId,orgScope).has(permission)) deny("permission_denied");
  };
  const masterPermissions = () => {
    const master = state.role_definitions.find(r => r.role_id === "master" && r.role_origin === "builtin" && r.status === "active");
    if (!master || revoked("role_definition",master.role_id)) return deny("master_catalog_unavailable");
    return new Set(master.permissions);
  };
  const projectChecks: ProjectEvidence[] = [];
  const scopeVerified = (scope: WireRoleAssignment["scope"]) => {
    if (scope.type === "organization" && scope.id === org) return;
    if (scope.type !== "project") deny("scope_unverifiable");
    const evidence = context.projects.find(e => e.organization_id === org && e.project_id === scope.id);
    if (!evidence || evidence.status !== "active" || !evidence.revision || !evidence.source_ref
      || !["canonical","test-fixture"].includes(evidence.evidence_kind)
      || (evidence.evidence_kind === "test-fixture" && !context.allowTestFixtures)
      || authorityInstant(evidence.valid_until) <= now) return deny("scope_unverifiable");
    if (!projectChecks.some(e => e.project_id === evidence.project_id)) projectChecks.push(structuredClone(evidence));
  };
  const grantable = (grantorId: string, role: WireRoleDefinition) => {
    requirePermission(grantorId,"authority.assignment.manage");
    const cap = masterPermissions(), held = permissions(grantorId,orgScope);
    if (role.permissions.some(p => !cap.has(p) || !held.has(p))) deny("grant_exceeds_authority");
  };
  const window = (v: Window) => {
    v.validFrom = normalizeWireTime(v.validFrom);
    if (v.validUntil !== null) {
      v.validUntil = normalizeWireTime(v.validUntil);
      if (authorityInstant(v.validUntil) <= authorityInstant(v.validFrom) || authorityInstant(v.validUntil) <= now) deny("invalid_validity");
    }
  };
  const covers = (from: string, until: string|null, target: Window) => authorityInstant(from) <= authorityInstant(target.validFrom)
    && (until === null || (target.validUntil !== null && authorityInstant(until) >= authorityInstant(target.validUntil)));
  const selfGrant = (grantorId: string, recipientId: string, role: WireRoleDefinition, scope: WireRoleAssignment["scope"], target: Window) => {
    if (grantorId !== recipientId) return;
    const available = activeAssignments(grantorId,scope).filter(a => {
      const m = state.memberships.find(m => m.membership_id === a.membership_id)!;
      return covers(a.valid_from,a.valid_until,target) && covers(m.valid_from,m.valid_until,target);
    });
    if (!available.length || role.permissions.some(p => !available.some(a => roleFor(a.role_id,a.role_version)!.permissions.includes(p)))) deny("self_elevation");
  };
  const checkProposal = (body: ProposalCommand, grantorId: string): string => {
    validateCommand(body); window(body);
    if (body.kind === "propose_membership") {
      requirePermission(grantorId,"authority.membership.manage");
      const evidence=context.initialIdentity;
      if(evidence){
        const p=evidence.principal;
        if(command.kind!=="propose_membership"||evidence.organizationId!==org||!evidence.revision
          || !['canonical','test-fixture'].includes(evidence.source)||(evidence.source==='test-fixture'&&!context.allowTestFixtures)
          ||p.principal_id!==body.principalId||p.principal_type!=='human'||p.status!=='active'
          ||p.external_identities.length!==1||p.external_identities[0].provider!=='github'
          ||p.external_identities[0].status!=='verified'||authorityInstant(p.external_identities[0].verified_at)>now
          ||state.principals.some(existing=>existing.principal_id===p.principal_id))deny('identity_conflict');
        state.principals.push(structuredClone(p));
      }
      human(body.principalId);
      if (state.memberships.some(m => m.membership_id === body.membershipId) || historicalRevocation("membership",body.membershipId)) deny("relationship_exists");
      if (body.principalId === grantorId && !state.memberships.some(m => m.principal_id === grantorId && memberActive(m) && covers(m.valid_from,m.valid_until,body))) deny("self_elevation");
      return body.principalId;
    }
    const m = state.memberships.find(m => m.membership_id === body.membershipId);
    if (!m || !memberActive(m)) return deny("membership_unavailable");
    human(m.principal_id);
    if (!covers(m.valid_from,m.valid_until,body)) deny("invalid_validity");
    if (state.role_assignments.some(a => a.assignment_id === body.assignmentId) || historicalRevocation("role_assignment",body.assignmentId)) deny("relationship_exists");
    const role = roleFor(body.roleId,body.roleVersion);if (!role) return deny("role_unavailable");
    grantable(grantorId,role);scopeVerified(body.scope);selfGrant(grantorId,m.principal_id,role,body.scope,body);
    return m.principal_id;
  };
  const plan: AdministrationPlan = { state, projectChecks };
  if (command.kind === "propose_membership" || command.kind === "propose_assignment") {
    const recipientId = checkProposal(command,actor.principalId);
    plan.proposal = { proposalId: command.proposalId, grantorId: actor.principalId, recipientId, body: command, status: "pending" };
  } else if (command.kind === "accept") {
    const proposal = context.proposal ? structuredClone(context.proposal) : undefined;
    if (!proposal || proposal.proposalId !== command.proposalId || proposal.status !== "pending") return deny("proposal_unavailable");
    if (proposal.recipientId !== actor.principalId) deny("recipient_mismatch");
    if (checkProposal(proposal.body,proposal.grantorId) !== proposal.recipientId) deny("recipient_mismatch");
    const b = proposal.body;
    if (b.kind === "propose_membership") state.memberships.push({ membership_id:b.membershipId,principal_id:b.principalId,organization_id:org,status:"active",valid_from:b.validFrom,valid_until:b.validUntil,accepted_at:effectiveAt });
    else state.role_assignments.push({ assignment_id:b.assignmentId,membership_id:b.membershipId,role_id:b.roleId,role_version:b.roleVersion,scope:b.scope,status:"active",valid_from:b.validFrom,valid_until:b.validUntil,accepted_at:effectiveAt });
    plan.consumedProposalId = command.proposalId;
  } else if (command.kind === "define_role") {
    requirePermission(actor.principalId,"authority.role_definition.manage");
    const r = command.role;
    if (!r || r.role_origin !== "organization") deny("role_unavailable");
    const cap = masterPermissions();
    if (!Array.isArray(r.permissions) || r.permissions.some(p => !cap.has(p))) deny("grant_exceeds_authority");
    const previous = state.role_definitions.filter(v => v.role_id === r.role_id);
    const maximum = previous.reduce((n,v) => wireVersion(v.role_version)>n?wireVersion(v.role_version):n,0n);
    if (wireVersion(r.role_version) !== maximum+1n) deny("role_version_conflict");
    state.role_definitions.push(r);
  } else {
    const membershipOperation = "membershipId" in command;
    requirePermission(actor.principalId,membershipOperation?"authority.membership.manage":"authority.assignment.manage");
    const entity = membershipOperation ? state.memberships.find(m => m.membership_id === command.membershipId)
      : state.role_assignments.find(a => a.assignment_id === command.assignmentId);
    const kind = membershipOperation ? "membership" : "role_assignment";
    const entityId = membershipOperation ? command.membershipId : command.assignmentId;
    if (!entity || entity.status === "revoked" || historicalRevocation(kind,entityId)) return deny("relationship_unavailable");
    if (command.kind.startsWith("resume_")) {
      if (entity.status !== "suspended") deny("invalid_transition");
      const affected = membershipOperation ? state.role_assignments.filter(a => a.membership_id === entityId && a.status === "active"
        && (a.valid_until === null || authorityInstant(a.valid_until) > now)) : [entity as WireRoleAssignment];
      for (const a of affected) {
        const m = state.memberships.find(m => m.membership_id === a.membership_id);
        const role = roleFor(a.role_id,a.role_version);
        if (!m || !role || revoked("role_assignment",a.assignment_id)) deny("relationship_unavailable");
        if (!membershipOperation && !memberActive(m!)) deny("membership_unavailable");
        human(m!.principal_id);grantable(actor.principalId,role!);scopeVerified(a.scope);
        selfGrant(actor.principalId,m!.principal_id,role!,a.scope,{validFrom:a.valid_from,validUntil:a.valid_until});
      }
      // Resume cannot extend an expired relationship or resurrect a revoked one.
      if (entity.valid_until !== null && authorityInstant(entity.valid_until) <= now) deny("invalid_validity");
      entity.status = "active";
    } else if (command.kind.startsWith("suspend_")) {
      if (entity.status !== "active") deny("invalid_transition");entity.status = "suspended";
    } else {
      id(context.revocationId);
      if (state.revocations.some(r => r.revocation_id === context.revocationId)) deny("revocation_conflict");
      entity.status = "revoked";
      state.revocations.push({revocation_id:context.revocationId,target_type:kind,target_id:entityId,effective_at:effectiveAt,recorded_in_authority_version:context.authorityVersion,reason_code:"ADMINISTRATIVE_REVOCATION"});
    }
  }
  plan.state = normalizeState(state,org);
  return plan;
}
