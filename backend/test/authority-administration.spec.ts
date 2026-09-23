import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateAdministration, type AdministrationCommand, type VerifiedHumanActor, type AdministrationContext } from "../src/authority/administration";
import type { WireFullContent } from "../src/authority/schema";
import { normalizeState } from "../src/authority/emission";

const vector=JSON.parse(readFileSync(fileURLToPath(new URL("../../docs/ROLES/fixtures/authority_interop_v1.json",import.meta.url)),"utf8"));
const now="2026-09-08T12:05:00Z", org="org-fixture", owner="p-😀", recipient="p-\uE000";
const master=["authority.membership.manage","authority.role_definition.manage","authority.assignment.manage","authority.binding.approve","authority.cutover.approve","mandate.create","mandate.sign","mandate.promote","mandate.install","intent.create","intent.cor.merge","agent.issuer.designate","create_project"];
function fixture():WireFullContent {
  const s=structuredClone(vector.base_state);
  s.principals[1].external_identities=[{provider:"github",subject:"recipient",display_handle:"recipient",status:"verified",verified_at:now}];
  s.principals.push({principal_id:"new-human",principal_type:"human",status:"active",external_identities:[{provider:"github",subject:"new-human",display_handle:"new",status:"verified",verified_at:now}]});
  s.memberships.push({...s.memberships[0],membership_id:"m-target",principal_id:recipient});
  s.role_definitions.push({role_id:"master",role_version:"1",role_origin:"builtin",display_name:"Master",status:"active",permissions:master},
    {role_id:"specialist",role_version:"1",role_origin:"builtin",display_name:"Specialist",status:"active",permissions:["intent.create"]});
  s.role_assignments.push({...s.role_assignments[0],assignment_id:"owner-master",role_id:"master",role_version:"1",scope:{type:"organization",id:org}});
  return s;
}
const actor=(principalId=owner):VerifiedHumanActor=>({principalId,organizationId:org,sessionId:"fixture-session",expiresAt:"2026-09-09T00:00:00Z",source:"test-fixture"});
const context=():AdministrationContext=>({organizationId:org,authorityVersion:"9007199254740994",now,revocationId:"r-admin",allowTestFixtures:true,
  projects:[{organization_id:org,project_id:"project-fixture",revision:"1",source_ref:"fixture:project",evidence_kind:"test-fixture",status:"active",valid_until:"2026-09-09T00:00:00Z"}]});
const grant=():AdministrationCommand=>({kind:"propose_assignment",proposalId:"proposal",assignmentId:"target-grant",membershipId:"m-target",roleId:"specialist",roleVersion:"1",scope:{type:"organization",id:org},validFrom:now,validUntil:null});
const run=(command:AdministrationCommand,s=fixture(),a=actor(),c=context())=>evaluateAdministration(s,a,command,c);

describe("bounded organizational administration",()=>{
  it('imports only initial verified identity through an authorized membership proposal, without a grant',()=>{
    const principal={principal_id:'initial-human',principal_type:'human' as const,status:'active' as const,external_identities:[{provider:'github',subject:'initial-subject',display_handle:'new',status:'verified' as const,verified_at:now}]};
    const c={...context(),initialIdentity:{organizationId:org,revision:'1',source:'test-fixture' as const,principal}};
    const command:AdministrationCommand={kind:'propose_membership',proposalId:'initial',membershipId:'m-initial',principalId:principal.principal_id,validFrom:now,validUntil:null};
    const result=run(command,fixture(),actor(),c);
    expect(result.state.principals).toContainEqual(principal);expect(result.state.memberships.some(m=>m.principal_id===principal.principal_id)).toBe(false);
    expect(()=>run(command,fixture(),actor(recipient),c)).toThrow('permission_denied');
    expect(()=>run(command,fixture(),actor(),{...c,initialIdentity:{...c.initialIdentity,organizationId:'other'}})).toThrow('identity_conflict');
    expect(()=>run(command,result.state,actor(),c)).toThrow('identity_conflict');
    expect(()=>run(command,fixture(),actor(),{...c,initialIdentity:{...c.initialIdentity,principal:{...principal,external_identities:[...principal.external_identities,{...principal.external_identities[0],subject:'another'}]}}})).toThrow('identity_conflict');
  });
  it("does not grant authority until the designated recipient accepts",()=>{
    const s=fixture(),before=JSON.stringify(s),proposal=run(grant(),s).proposal!;
    expect(JSON.stringify(s)).toBe(before);
    expect(run(grant(),s).state.role_assignments.some(a=>a.assignment_id==="target-grant")).toBe(false);
    const result=run({kind:"accept",proposalId:"proposal"},s,actor(recipient),{...context(),proposal});
    expect(result.state.role_assignments.find(a=>a.assignment_id==="target-grant")).toMatchObject({status:"active",accepted_at:now,role_version:"1"});
    expect(result.consumedProposalId).toBe("proposal");
  });
  it("rejects acceptance by another actor",()=>{
    const proposal=run(grant()).proposal!;
    expect(()=>run({kind:"accept",proposalId:"proposal"},fixture(),actor(),{...context(),proposal})).toThrow("recipient_mismatch");
  });
  it.each(["membership","assignment","principal","role"])("revalidates the grantor after %s suspension",kind=>{
    const proposal=run(grant()).proposal!,s=fixture();
    if(kind==="membership")s.memberships[0].status="suspended";
    if(kind==="assignment")s.role_assignments.find(a=>a.assignment_id==="owner-master")!.status="suspended";
    if(kind==="principal")s.principals[0].status="suspended";
    if(kind==="role")s.role_definitions.find(r=>r.role_id==="master")!.status="suspended";
    expect(()=>run({kind:"accept",proposalId:"proposal"},s,actor(recipient),{...context(),proposal})).toThrow();
  });
  it("creates an accepted membership only after acceptance by the verified human",()=>{
    const command:AdministrationCommand={kind:"propose_membership",proposalId:"member-proposal",membershipId:"m-new",principalId:"new-human",validFrom:now,validUntil:null};
    const proposal=run(command).proposal!;expect(run(command).state.memberships).toHaveLength(2);
    expect(run({kind:"accept",proposalId:"member-proposal"},fixture(),actor("new-human"),{...context(),proposal}).state.memberships.find(m=>m.membership_id==="m-new")).toMatchObject({status:"active",accepted_at:now});
  });
  it("requires canonical project membership for proposal and acceptance",()=>{
    const command=grant();if(command.kind!=="propose_assignment")throw Error();command.scope={type:"project",id:"project-fixture"};
    const plan=run(command);expect(plan.projectChecks).toHaveLength(1);
    expect(()=>run({kind:"accept",proposalId:"proposal"},fixture(),actor(recipient),{...context(),proposal:plan.proposal,projects:[]})).toThrow("scope_unverifiable");
  });
  it.each(["absent","wrong-org","expired","revoked"])("rejects %s project evidence",kind=>{
    const command=grant();if(command.kind!=="propose_assignment")throw Error();command.scope={type:"project",id:"project-fixture"};
    const c=context();if(kind==="absent")c.projects=[];
    if(kind==="wrong-org")c.projects[0].organization_id="other";
    if(kind==="expired")c.projects[0].valid_until=now;
    if(kind==="revoked")c.projects[0].status="revoked";
    expect(()=>run(command,fixture(),actor(),c)).toThrow("scope_unverifiable");
  });
  it("does not turn project authority into organization administration",()=>{
    const s=fixture();s.role_assignments.find(a=>a.assignment_id==="owner-master")!.scope={type:"project",id:"project-fixture"};
    expect(()=>run(grant(),s)).toThrow("permission_denied");
  });
  it("does not grant beyond the grantor's organization permissions",()=>{
    const s=fixture();s.role_definitions.push({role_id:"limited",role_version:"1",role_origin:"organization",display_name:"limited",status:"active",permissions:["authority.assignment.manage","intent.create"]});
    s.role_assignments.find(a=>a.assignment_id==="owner-master")!.role_id="limited";
    expect(run(grant(),s).proposal).toBeDefined();
    const command=grant();if(command.kind!=="propose_assignment")throw Error();command.roleId="master";
    expect(()=>run(command,s)).toThrow("grant_exceeds_authority");
  });
  it.each(["vault.key.read","executor.command.execute"])("rejects defining and granting %s",permission=>{
    const role={role_id:"excluded",role_version:"1",role_origin:"organization" as const,display_name:"excluded",status:"active" as const,permissions:[permission]};
    expect(()=>run({kind:"define_role",role})).toThrow("grant_exceeds_authority");
    const s=fixture();s.role_definitions.push(role);const command=grant();if(command.kind!=="propose_assignment")throw Error();command.roleId=role.role_id;
    expect(()=>run(command,s)).toThrow("grant_exceeds_authority");
  });
  it("versions role definitions without granting them",()=>{
    const result=run({kind:"define_role",role:{role_id:"org:editor",role_version:"11",role_origin:"organization",display_name:"Editor",status:"active",permissions:["intent.create"]}});
    expect(result.state.role_definitions.filter(r=>r.role_id==="org:editor").map(r=>r.role_version)).toEqual(["2","10","11"]);
    expect(result.state.role_assignments).toHaveLength(fixture().role_assignments.length);
  });
  it("rejects a self grant that adds scope",()=>{
    const command=grant();if(command.kind!=="propose_assignment")throw Error();command.membershipId="m-1";command.scope={type:"project",id:"new-project"};
    const c=context();c.projects[0].project_id="new-project";
    expect(()=>run(command,fixture(),actor(),c)).toThrow("self_elevation");
  });
  it("rejects self extension of an assignment or membership",()=>{
    const s=fixture();s.role_assignments.find(a=>a.assignment_id==="owner-master")!.valid_until="2026-09-08T13:00:00Z";
    const command=grant();if(command.kind!=="propose_assignment")throw Error();command.membershipId="m-1";
    expect(()=>run(command,s)).toThrow("self_elevation");
    s.memberships[0].valid_until="2026-09-08T13:00:00Z";
    expect(()=>run({kind:"propose_membership",proposalId:"self",membershipId:"m-extra",principalId:owner,validFrom:now,validUntil:null},s)).toThrow("self_elevation");
  });
  it("allows a redundant self grant that adds no scope, capacity or validity",()=>{
    const command=grant();if(command.kind!=="propose_assignment")throw Error();command.membershipId="m-1";
    expect(run(command).proposal).toBeDefined();
  });
  it("distinguishes suspension/resume from irrevocable revocation",()=>{
    const proposal=run(grant()).proposal!;
    const accepted=run({kind:"accept",proposalId:"proposal"},fixture(),actor(recipient),{...context(),proposal}).state;
    const suspended=run({kind:"suspend_assignment",assignmentId:"target-grant"},accepted).state;
    expect(run({kind:"resume_assignment",assignmentId:"target-grant"},suspended).state.role_assignments.find(a=>a.assignment_id==="target-grant")?.status).toBe("active");
    const revoked=run({kind:"revoke_assignment",assignmentId:"target-grant"},accepted).state;
    expect(revoked.revocations).toHaveLength(1);
    expect(()=>run({kind:"resume_assignment",assignmentId:"target-grant"},revoked)).toThrow("relationship_unavailable");
    expect(()=>run(grant(),revoked)).toThrow("relationship_exists");
  });
  it("suspends/resumes membership without losing history, and never resumes a revocation",()=>{
    const s=fixture();
    const suspended=run({kind:"suspend_membership",membershipId:"m-target"},s).state;
    expect(run({kind:"resume_membership",membershipId:"m-target"},suspended).state.memberships.find(m=>m.membership_id==="m-target")?.status).toBe("active");
    const revoked=run({kind:"revoke_membership",membershipId:"m-target"},s).state;
    expect(revoked.revocations[0]).toMatchObject({target_type:"membership",target_id:"m-target",recorded_in_authority_version:context().authorityVersion});
    expect(()=>run({kind:"resume_membership",membershipId:"m-target"},revoked)).toThrow("relationship_unavailable");
  });
  it("requires grant authority to resume a membership holding an assignment",()=>{
    const s=fixture();s.memberships.find(m=>m.membership_id==="m-target")!.status="suspended";
    s.role_assignments.push({...s.role_assignments[0],assignment_id:"target-master",membership_id:"m-target",role_id:"master",role_version:"1",scope:{type:"organization",id:org}});
    s.role_definitions.push({role_id:"membership-manager",role_version:"1",role_origin:"organization",display_name:"Membership manager",status:"active",permissions:["authority.membership.manage"]});
    s.role_assignments.find(a=>a.assignment_id==="owner-master")!.role_id="membership-manager";
    expect(()=>run({kind:"resume_membership",membershipId:"m-target"},s)).toThrow("permission_denied");
  });
  it.each(["onboarding","recover_master","principal_merge","add_identity","create_service","principal_suspend"])("rejects deferred %s",kind=>{
    expect(()=>run({kind} as AdministrationCommand)).toThrow("operation_unavailable");
  });
  it.each(["service","unverified","expired","other-org","fixture-disabled"])("rejects %s actor",kind=>{
    const s=fixture(),a=actor(),c=context();
    if(kind==="service")s.principals[0].principal_type="service";
    if(kind==="unverified")s.principals[0].external_identities=[];
    if(kind==="expired")a.expiresAt=now;
    if(kind==="other-org")a.organizationId="other";
    if(kind==="fixture-disabled")c.allowTestFixtures=false;
    expect(()=>run(grant(),s,a,c)).toThrow();
  });
  it("does not accept arbitrary fields or an unverified resource scope",()=>{
    expect(()=>run({...grant(),permissions:["*"]} as unknown as AdministrationCommand)).toThrow("invalid_command");
    const command=grant();if(command.kind!=="propose_assignment")throw Error();command.scope={type:"resource",id:"resource"};
    expect(()=>run(command)).toThrow("scope_unverifiable");
  });
});

// Propuesta_Diseno_Resolucion_AsignacionRolesBuiltin_v0_1.md §4.1 (R1-R4): reconciliación
// determinista del catálogo builtin en evaluateAdministration.
describe("builtin catalog reconciliation (R1-R4)",()=>{
  // Organización "existente": su estado sólo tiene `master` — la forma exacta que produjo la
  // génesis antes de este cambio.
  const masterOnly=()=>{const s=fixture();s.role_definitions=s.role_definitions.filter(r=>r.role_origin!=="builtin"||r.role_id==="master");return s;};
  const builtinIds=(s:WireFullContent)=>s.role_definitions.filter(r=>r.role_origin==="builtin").map(r=>r.role_id).sort();
  it("grants specialist on a master-only state, materializing only the missing builtin definitions",()=>{
    const before=masterOnly();const proposal=run(grant(),before);
    expect(builtinIds(proposal.state)).toEqual(["master","operator","specialist"]);
    const accepted=run({kind:"accept",proposalId:"proposal"},proposal.state,actor(recipient),{...context(),proposal:proposal.proposal});
    expect(accepted.state.role_assignments.some(a=>a.assignment_id==="target-grant"&&a.role_id==="specialist")).toBe(true);
    // Nada preexistente cambia: todas las definiciones previas siguen idénticas.
    for(const r of normalizeState(before,org).role_definitions)expect(accepted.state.role_definitions).toContainEqual(r);
    expect(accepted.state.role_definitions.length).toBe(before.role_definitions.length+2);
  });
  it("reconciles on any administrative command, not only grants",()=>{
    const result=run({kind:"suspend_membership",membershipId:"m-target"},masterOnly());
    expect(builtinIds(result.state)).toEqual(["master","operator","specialist"]);
  });
  it("never modifies an existing builtin definition (a suspended specialist stays suspended and is not grantable)",()=>{
    const s=fixture();s.role_definitions.find(r=>r.role_id==="specialist")!.status="suspended";
    expect(()=>run(grant(),s)).toThrow("role_unavailable");
    const result=run({kind:"suspend_membership",membershipId:"m-target"},s);
    expect(result.state.role_definitions.filter(r=>r.role_id==="specialist")).toEqual([expect.objectContaining({status:"suspended"})]);
  });
  it("never re-adds a builtin whose role_id carries a role_definition revocation",()=>{
    const s=masterOnly();s.revocations.push({revocation_id:"rv-specialist",target_type:"role_definition",target_id:"specialist",effective_at:now,recorded_in_authority_version:"1",reason_code:"TEST"});
    expect(()=>run(grant(),s)).toThrow("role_unavailable");
    expect(builtinIds(run({kind:"suspend_membership",membershipId:"m-target"},s).state)).toEqual(["master","operator"]);
  });
  it("does not relax grant guards: a grantor lacking the builtin's permissions still cannot grant it",()=>{
    const s=masterOnly();
    s.role_definitions.push({role_id:"assigner",role_version:"1",role_origin:"organization",display_name:"assigner",status:"active",permissions:["authority.assignment.manage"]});
    s.role_assignments.push({...s.role_assignments.find(a=>a.assignment_id==="owner-master")!,assignment_id:"recipient-assigner",membership_id:"m-target",role_id:"assigner"});
    const command:AdministrationCommand={...grant(),assignmentId:"x",proposalId:"x"} as AdministrationCommand;
    // recipient holds authority.assignment.manage but not intent.create → operator/specialist not grantable by them.
    expect(()=>run({...command,membershipId:s.memberships[0].membership_id} as AdministrationCommand,s,actor(recipient))).toThrow("grant_exceeds_authority");
  });
  it("is deterministic across the double evaluation used by administerAuthority",()=>{
    const s=masterOnly();expect(JSON.stringify(run(grant(),s).state)).toBe(JSON.stringify(run(grant(),s).state));
  });
});
