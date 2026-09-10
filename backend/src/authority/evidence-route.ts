import { canonicalizeJson, digestWire } from "./canonical";

export interface EvidenceBinding { organizationId: string; installationId: string }
type EvidenceRow = { evidence_id:string; kind:string; at:string; authority_version:string|null; operation:string|null;
  status:string|null; actor_id:string|null; urgency:string|null; attempts:number|null; accepted_at:string|null;
  commit_to_acceptance_ms:number|null; commit_to_hypothetical_restriction_ms:number|null };

function cursorEncode(binding:EvidenceBinding,row:EvidenceRow):string{
  const raw=new TextEncoder().encode(canonicalizeJson({organization_id:binding.organizationId,installation_id:binding.installationId,at:row.at,evidence_id:row.evidence_id}));
  let binary="";for(const b of raw)binary+=String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function cursorDecode(value:string,binding:EvidenceBinding):{at:string;evidence_id:string}|null{
  try{const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);const binary=atob(padded);
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const parsed=JSON.parse(new TextDecoder().decode(bytes));
    if(Object.keys(parsed).sort().join(",")!=="at,evidence_id,installation_id,organization_id"||parsed.organization_id!==binding.organizationId||parsed.installation_id!==binding.installationId||typeof parsed.at!=="string"||typeof parsed.evidence_id!=="string")return null;
    return {at:parsed.at,evidence_id:parsed.evidence_id};
  }catch{return null;}
}

/** Authenticated, minimized evidence view. It deliberately excludes snapshot bytes,
 * signatures, challenges, sessions, lease ids and command/details payloads. */
export async function authorityEvidenceResponse(db:D1Database,request:Request,binding:EvidenceBinding,now=new Date()):Promise<Response>{
  const url=new URL(request.url),org=url.searchParams.get("org");
  if(request.method!=="GET")return Response.json({error:"method_not_allowed"},{status:405});
  if(!org)return Response.json({error:"missing_org"},{status:400});
  if(org!==binding.organizationId)return Response.json({error:"recipient_mismatch"},{status:403});
  const limitRaw=url.searchParams.get("limit")??"50";
  if(!/^[1-9][0-9]*$/.test(limitRaw)||Number(limitRaw)>100)return Response.json({error:"invalid_limit"},{status:400});
  const cursorRaw=url.searchParams.get("cursor"),cursor=cursorRaw?cursorDecode(cursorRaw,binding):null;
  if(cursorRaw&&!cursor)return Response.json({error:"invalid_cursor"},{status:400});
  const session=db.withSession("first-primary");
  const query=`SELECT * FROM (
    SELECT 'emission:'||e.authority_version evidence_id,'emission' kind,json_extract(e.metadata_json,'$.issued_at') at,e.authority_version,NULL operation,'persisted' status,NULL actor_id,NULL urgency,NULL attempts,NULL accepted_at,NULL commit_to_acceptance_ms,NULL commit_to_hypothetical_restriction_ms FROM authority_emissions e WHERE e.organization_id=?1
    UNION ALL SELECT 'audit:'||a.request_id,'administration',a.at,a.after_version,a.operation,'committed',a.actor_id,NULL,NULL,NULL,NULL,NULL FROM authority_admin_audit a WHERE a.organization_id=?1
    UNION ALL SELECT 'outbox:'||o.event_id,'outbox',o.created_at,o.authority_version,NULL,CASE WHEN o.delivered_at IS NULL THEN 'pending' ELSE 'delivered' END,NULL,NULL,NULL,NULL,NULL,NULL FROM authority_admin_outbox o WHERE o.organization_id=?1
    UNION ALL SELECT 'delivery:'||d.event_id||':'||d.installation_id,'delivery',d.committed_at,d.authority_version,NULL,d.status,NULL,d.urgency,d.attempts,d.acknowledged_at,NULL,NULL FROM authority_sync_deliveries d WHERE d.organization_id=?1 AND d.installation_id=?2
    UNION ALL SELECT 'measurement:'||m.event_id||':'||m.installation_id,'measurement',m.committed_at,m.authority_version,NULL,CASE WHEN m.accepted_at IS NULL THEN 'pending' ELSE 'accepted' END,NULL,m.urgency,NULL,m.accepted_at,CASE WHEN m.accepted_at IS NULL THEN NULL ELSE CAST((julianday(m.accepted_at)-julianday(m.committed_at))*86400000 AS INTEGER) END,CAST((julianday(m.hypothetical_restriction_at)-julianday(m.committed_at))*86400000 AS INTEGER) FROM authority_sync_measurements m WHERE m.organization_id=?1 AND m.installation_id=?2
  ) WHERE (?3 IS NULL OR at>?3 OR (at=?3 AND evidence_id>?4)) ORDER BY at,evidence_id LIMIT ?5`;
  try{
    const rows=await session.prepare(query).bind(binding.organizationId,binding.installationId,cursor?.at??null,cursor?.evidence_id??"",Number(limitRaw)+1).all<EvidenceRow>();
    const page=rows.results.slice(0,Number(limitRaw));
    const items=page.map(r=>({evidence_id:r.evidence_id,kind:r.kind,at:r.at,authority_version:r.authority_version,operation:r.operation,status:r.status,actor_id:r.actor_id,urgency:r.urgency,attempts:r.attempts,accepted_at:r.accepted_at,commit_to_acceptance_ms:r.commit_to_acceptance_ms,commit_to_hypothetical_restriction_ms:r.commit_to_hypothetical_restriction_ms}));
    const body={schema:"bloom.authority.evidence",schema_version:"1.0",organization_id:binding.organizationId,installation_id:binding.installationId,generated_at:now.toISOString(),items,next_cursor:rows.results.length>page.length&&page.length?cursorEncode(binding,page[page.length-1]):null};
    const integrity={algorithm:"SHA-256",digest:await digestWire(body)};
    return Response.json({...body,integrity},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"authority_evidence_unavailable"},{status:503});}
}
