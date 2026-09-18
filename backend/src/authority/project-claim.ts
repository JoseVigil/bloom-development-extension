export type ProjectClaimStatus = 'claimed' | 'already_claimed';
export interface ProjectClaimResult { status: ProjectClaimStatus; organizationId: string; tenantId: string; projectId: string; revision: '1'; sourceRef: string; evidenceKind: 'canonical'; claimedAt: string; }
export interface ProjectBindingResult { status: 'bound'; organizationId: string; tenantId: string; projectId: string; revision: '1'; sourceRef: string; evidenceKind: 'canonical'; claimedAt: string; validUntil: string; checkedAt: string; }
export class ProjectClaimError extends Error { constructor(public status: 400|403|404|409|410|500|503, message: string) { super(message); } }

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EVIDENCE_LIFETIME_MS = 24*60*60*1000;
interface ClaimRow { project_id:string; organization_id:string; tenant_id:string; installation_id:string; revision:'1'; source_ref:string; evidence_kind:'canonical'; claimed_at:string; }
interface EvidenceRow { organization_id:string; project_id:string; revision:string; source_ref:string; evidence_kind:string; status:string; valid_until:string; }
interface BindingRow extends ClaimRow { current_tenant_id:string|null; evidence_organization_id:string|null; evidence_project_id:string|null; evidence_revision:string|null; evidence_source_ref:string|null; evidence_kind_value:string|null; evidence_status:string|null; evidence_valid_until:string|null; }

function result(row:ClaimRow,status:ProjectClaimStatus):ProjectClaimResult { return {status,organizationId:row.organization_id,tenantId:row.tenant_id,projectId:row.project_id,revision:row.revision,sourceRef:row.source_ref,evidenceKind:row.evidence_kind,claimedAt:row.claimed_at}; }
function compatible(row:ClaimRow,e:EvidenceRow):boolean { return e.organization_id===row.organization_id&&e.project_id===row.project_id&&e.revision===row.revision&&e.source_ref===row.source_ref&&e.evidence_kind==='canonical'; }
async function authorize(session:ReturnType<D1Database['withSession']>,org:string,installation:string) {
  const organization=await session.prepare('SELECT id, tenant_id FROM organizations WHERE id=?').bind(org).first<{id:string;tenant_id:string|null}>();
  if(!organization)throw new ProjectClaimError(404,'organization_not_found');
  if(!organization.tenant_id)throw new ProjectClaimError(500,'organization_tenant_missing');
  const key=await session.prepare('SELECT organization_id,status FROM installation_keys WHERE installation_id=?').bind(installation).first<{organization_id:string;status:string}>();
  if(!key||key.status!=='active'||key.organization_id!==org)throw new ProjectClaimError(403,'installation_not_authorized');
  return organization.tenant_id;
}
async function readEvidence(session:ReturnType<D1Database['withSession']>,row:ClaimRow,now:Date,expiryCode:'project_binding_expired'|'project_evidence_renewal_failed'):Promise<EvidenceRow>{
  const all=await session.prepare('SELECT * FROM authority_project_scope_evidence WHERE project_id=?').bind(row.project_id).all<EvidenceRow>();
  if(all.results.length===0)throw new ProjectClaimError(404,'project_binding_not_found');
  if(all.results.length!==1||!compatible(row,all.results[0]))throw new ProjectClaimError(409,'project_binding_inconsistent');
  const e=all.results[0];
  if(e.status==='revoked')throw new ProjectClaimError(410,'project_binding_revoked');
  if(e.status!=='active'||!Number.isFinite(Date.parse(e.valid_until)))throw new ProjectClaimError(409,'project_binding_inconsistent');
  if(Date.parse(e.valid_until)<=now.getTime())throw new ProjectClaimError(expiryCode==='project_binding_expired'?410:500,expiryCode);
  return e;
}
async function guaranteeEvidence(session:ReturnType<D1Database['withSession']>,row:ClaimRow,now:Date):Promise<void>{
  const all=await session.prepare('SELECT * FROM authority_project_scope_evidence WHERE project_id=?').bind(row.project_id).all<EvidenceRow>();
  if(all.results.length>1||all.results.some(e=>!compatible(row,e)))throw new ProjectClaimError(409,'project_binding_inconsistent');
  if(all.results[0]?.status==='revoked')throw new ProjectClaimError(410,'project_binding_revoked');
  if(all.results[0]&&all.results[0].status!=='active')throw new ProjectClaimError(409,'project_binding_inconsistent');
  const until=new Date(now.getTime()+EVIDENCE_LIFETIME_MS).toISOString();
  try {
    const completed=await session.batch([
      session.prepare(`INSERT INTO authority_project_scope_evidence (organization_id,project_id,revision,source_ref,evidence_kind,status,valid_until) SELECT ?,?,?,?,?,'active',? WHERE NOT EXISTS (SELECT 1 FROM authority_project_scope_evidence WHERE project_id=?)`).bind(row.organization_id,row.project_id,row.revision,row.source_ref,'canonical',until,row.project_id),
      session.prepare(`UPDATE authority_project_scope_evidence SET valid_until=? WHERE organization_id=? AND project_id=? AND revision=? AND source_ref=? AND evidence_kind='canonical' AND status='active'`).bind(until,row.organization_id,row.project_id,row.revision,row.source_ref),
      session.prepare('SELECT * FROM authority_project_scope_evidence WHERE project_id=?').bind(row.project_id),
    ]);
    const finalRows=(completed[2].results??[]) as unknown as EvidenceRow[];
    if(finalRows.length!==1||!compatible(row,finalRows[0])||finalRows[0].status!=='active'||!Number.isFinite(Date.parse(finalRows[0].valid_until))||Date.parse(finalRows[0].valid_until)<=now.getTime())throw new ProjectClaimError(500,'project_evidence_renewal_failed');
  } catch {
    try { await readEvidence(session,row,now,'project_evidence_renewal_failed'); return; }
    catch (error) { if (error instanceof ProjectClaimError && error.message !== 'project_binding_not_found') throw error; }
    throw new ProjectClaimError(500,'project_evidence_renewal_failed');
  }
}

export async function claimProject(db:D1Database,organizationId:string,installationId:string,projectId:string,now=new Date()):Promise<ProjectClaimResult>{
  if(!CANONICAL_UUID.test(projectId))throw new ProjectClaimError(400,'invalid_project_id');
  if(!organizationId||!installationId)throw new ProjectClaimError(400,'invalid_request');
  const session=db.withSession('first-primary'); const tenantId=await authorize(session,organizationId,installationId);
  const existing=await session.prepare('SELECT * FROM authority_project_claims WHERE project_id=?').bind(projectId).first<ClaimRow>();
  if(existing){ if(existing.organization_id!==organizationId)throw new ProjectClaimError(409,'project_already_claimed'); if(existing.tenant_id!==tenantId)throw new ProjectClaimError(409,'project_binding_inconsistent'); await guaranteeEvidence(session,existing,now); return result(existing,'already_claimed'); }
  const claimedAt=now.toISOString(),sourceRef=`installation:${installationId}`;
  const row:ClaimRow={project_id:projectId,organization_id:organizationId,tenant_id:tenantId,installation_id:installationId,revision:'1',source_ref:sourceRef,evidence_kind:'canonical',claimed_at:claimedAt};
  try { const completed=await session.batch([
    session.prepare(`INSERT INTO authority_project_claims (project_id,organization_id,tenant_id,installation_id,revision,source_ref,evidence_kind,claimed_at) VALUES (?,?,?,?,?,?,?,?)`).bind(projectId,organizationId,tenantId,installationId,'1',sourceRef,'canonical',claimedAt),
    session.prepare(`INSERT INTO authority_project_scope_evidence (organization_id,project_id,revision,source_ref,evidence_kind,status,valid_until) VALUES (?,?,?,?,?,'active',?)`).bind(organizationId,projectId,'1',sourceRef,'canonical',new Date(now.getTime()+EVIDENCE_LIFETIME_MS).toISOString()),
    session.prepare('SELECT * FROM authority_project_scope_evidence WHERE project_id=?').bind(projectId)]);
    const finalRows=(completed[2].results??[]) as unknown as EvidenceRow[];
    if(finalRows.length!==1||!compatible(row,finalRows[0])||finalRows[0].status!=='active'||Date.parse(finalRows[0].valid_until)<=now.getTime())throw new ProjectClaimError(500,'project_evidence_renewal_failed');
    return result(row,'claimed');
  } catch(error){ const raced=await session.prepare('SELECT * FROM authority_project_claims WHERE project_id=?').bind(projectId).first<ClaimRow>(); if(raced){if(raced.organization_id!==organizationId)throw new ProjectClaimError(409,'project_already_claimed');if(raced.tenant_id!==tenantId)throw new ProjectClaimError(409,'project_binding_inconsistent');await guaranteeEvidence(session,raced,now);return result(raced,'already_claimed');} if(error instanceof ProjectClaimError)throw error; throw new ProjectClaimError(500,'project_claim_failed'); }
}

export async function getProjectBinding(db:D1Database,organizationId:string,installationId:string,projectId:string,now=new Date()):Promise<ProjectBindingResult>{
  if(!CANONICAL_UUID.test(projectId))throw new ProjectClaimError(400,'invalid_project_id');
  const session=db.withSession('first-primary'); const tenantId=await authorize(session,organizationId,installationId);
  const claim=await session.prepare(`SELECT c.*,o.tenant_id current_tenant_id,e.organization_id evidence_organization_id,e.project_id evidence_project_id,e.revision evidence_revision,e.source_ref evidence_source_ref,e.evidence_kind evidence_kind_value,e.status evidence_status,e.valid_until evidence_valid_until FROM authority_project_claims c JOIN organizations o ON o.id=c.organization_id LEFT JOIN authority_project_scope_evidence e ON e.project_id=c.project_id WHERE c.project_id=?`).bind(projectId).first<BindingRow>();
  if(!claim)throw new ProjectClaimError(404,'project_binding_not_found');
  if(claim.organization_id!==organizationId)throw new ProjectClaimError(403,'project_binding_cross_organization');
  if(claim.tenant_id!==tenantId||claim.current_tenant_id!==tenantId||claim.revision!=='1'||claim.evidence_kind!=='canonical'||claim.source_ref!==`installation:${claim.installation_id}`)throw new ProjectClaimError(409,'project_binding_inconsistent');
  if(claim.evidence_project_id===null)throw new ProjectClaimError(404,'project_binding_not_found');
  if(claim.evidence_organization_id!==claim.organization_id||claim.evidence_project_id!==claim.project_id||claim.evidence_revision!==claim.revision||claim.evidence_source_ref!==claim.source_ref||claim.evidence_kind_value!=='canonical')throw new ProjectClaimError(409,'project_binding_inconsistent');
  if(claim.evidence_status==='revoked')throw new ProjectClaimError(410,'project_binding_revoked');
  if(claim.evidence_status!=='active'||claim.evidence_valid_until===null||!Number.isFinite(Date.parse(claim.evidence_valid_until)))throw new ProjectClaimError(409,'project_binding_inconsistent');
  if(Date.parse(claim.evidence_valid_until)<=now.getTime())throw new ProjectClaimError(410,'project_binding_expired');
  return {status:'bound',organizationId,tenantId,projectId,revision:'1',sourceRef:claim.source_ref,evidenceKind:'canonical',claimedAt:claim.claimed_at,validUntil:claim.evidence_valid_until,checkedAt:now.toISOString()};
}
