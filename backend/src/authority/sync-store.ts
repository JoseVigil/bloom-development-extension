export type SyncUrgency = "critical" | "privileged" | "standard";
export interface AuthorityNotice {
  organization_id:string; event_id:string; installation_id:string; authority_version:string;
  correlation_id:string; urgency:SyncUrgency; committed_at:string;
}
export interface ClaimedNotice extends AuthorityNotice { lease_id:string; lease_expires_at:string; attempts:number }

const iso=(value:Date|string)=>typeof value==="string"?new Date(value).toISOString():value.toISOString();
const validUrgency=(v:unknown):v is SyncUrgency=>v==="critical"||v==="privileged"||v==="standard";

/** Expands immutable outbox evidence into one durable delivery per signed audience member. */
export async function materializeAuthorityOutbox(db:D1Database):Promise<number>{
 const rows=await db.prepare(`SELECT o.organization_id,o.event_id,o.authority_version,o.payload_json,o.created_at,e.metadata_json
  FROM authority_admin_outbox o JOIN authority_emissions e ON e.organization_id=o.organization_id AND e.authority_version=o.authority_version
  WHERE o.delivered_at IS NULL`).all<any>(); let created=0;
 for(const row of rows.results){
  const payload=JSON.parse(row.payload_json),metadata=JSON.parse(row.metadata_json);
  const ids=metadata?.audience?.installation_ids;
  if(!Array.isArray(ids)||!ids.every((x:unknown)=>typeof x==="string"&&x.length))throw new Error("authority_sync_audience_invalid");
  const urgency:SyncUrgency=validUrgency(payload.urgency)?payload.urgency:"standard";
  const correlation=typeof payload.correlation_id==="string"&&payload.correlation_id?payload.correlation_id:row.event_id;
  for(const installation of [...new Set<string>(ids)]){
   const result=await db.prepare(`INSERT OR IGNORE INTO authority_sync_deliveries
    (organization_id,event_id,installation_id,authority_version,correlation_id,urgency,committed_at)
    VALUES(?,?,?,?,?,?,?)`).bind(row.organization_id,row.event_id,installation,row.authority_version,correlation,urgency,row.created_at).run();
   await db.prepare(`INSERT OR IGNORE INTO authority_sync_measurements
    (organization_id,event_id,installation_id,authority_version,urgency,committed_at,hypothetical_restriction_at)
    VALUES(?,?,?,?,?,?,?)`).bind(row.organization_id,row.event_id,installation,row.authority_version,urgency,row.created_at,
      new Date(Date.parse(row.created_at)+50000).toISOString()).run();
   created+=Number(result.meta.changes??0);
  }
 }
 return created;
}

export async function claimAuthorityNotices(db:D1Database,workerId:string,now:Date,leaseMs=15000,limit=32):Promise<ClaimedNotice[]>{
 if(!workerId||leaseMs<1||limit<1)throw new Error("authority_sync_claim_invalid");
 const at=iso(now),expires=new Date(now.getTime()+leaseMs).toISOString();
 await db.prepare(`UPDATE authority_sync_deliveries SET status='pending',lease_id=NULL,lease_expires_at=NULL
  WHERE status='leased' AND lease_expires_at<=?`).bind(at).run();
 const candidates=await db.prepare(`SELECT organization_id,event_id,installation_id FROM authority_sync_deliveries
  WHERE status='pending' ORDER BY committed_at,event_id,installation_id LIMIT ?`).bind(limit).all<any>();
 const claimed:ClaimedNotice[]=[];
 for(const key of candidates.results){
  const lease=`${workerId}:${crypto.randomUUID()}`;
  const row=await db.prepare(`UPDATE authority_sync_deliveries SET status='leased',lease_id=?,lease_expires_at=?,attempts=attempts+1
   WHERE organization_id=? AND event_id=? AND installation_id=? AND status='pending' RETURNING *`)
   .bind(lease,expires,key.organization_id,key.event_id,key.installation_id).first<any>();
  if(row)claimed.push({organization_id:row.organization_id,event_id:row.event_id,installation_id:row.installation_id,
   authority_version:row.authority_version,correlation_id:row.correlation_id,urgency:row.urgency,
   committed_at:row.committed_at,lease_id:row.lease_id,lease_expires_at:row.lease_expires_at,attempts:row.attempts});
 }
 return claimed;
}

export async function acknowledgeAuthorityNotice(db:D1Database,n:ClaimedNotice,noticedAt:Date):Promise<boolean>{
 const at=iso(noticedAt);
 const row=await db.prepare(`UPDATE authority_sync_deliveries SET status='acknowledged',noticed_at=?,acknowledged_at=?,lease_id=NULL,lease_expires_at=NULL
  WHERE organization_id=? AND event_id=? AND installation_id=? AND status='leased' AND lease_id=? AND lease_expires_at>?
  RETURNING event_id`).bind(at,at,n.organization_id,n.event_id,n.installation_id,n.lease_id,at).first();
 if(!row)return false;
 await db.prepare(`UPDATE authority_sync_measurements SET noticed_at=COALESCE(noticed_at,?) WHERE organization_id=? AND event_id=? AND installation_id=?`)
  .bind(at,n.organization_id,n.event_id,n.installation_id).run();
 await db.prepare(`UPDATE authority_admin_outbox SET delivered_at=? WHERE organization_id=? AND event_id=? AND delivered_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM authority_sync_deliveries d WHERE d.organization_id=? AND d.event_id=? AND d.status<>'acknowledged')`)
  .bind(at,n.organization_id,n.event_id,n.organization_id,n.event_id).run();
 return true;
}

export async function recordAuthorityPull(db:D1Database,org:string,installation:string,version:string,at:Date):Promise<void>{
 await db.prepare(`UPDATE authority_sync_measurements SET pull_started_at=COALESCE(pull_started_at,?)
  WHERE organization_id=? AND installation_id=? AND authority_version=?`).bind(iso(at),org,installation,version).run();
}
export async function recordAuthorityAcceptance(db:D1Database,org:string,installation:string,version:string,at:Date):Promise<void>{
 await db.prepare(`UPDATE authority_sync_measurements SET accepted_at=COALESCE(accepted_at,?)
  WHERE organization_id=? AND installation_id=? AND authority_version=?`).bind(iso(at),org,installation,version).run();
}
export async function authoritySyncMeasurements(db:D1Database,org:string,installation:string){
 const rows=await db.prepare(`SELECT *,CASE WHEN accepted_at IS NULL THEN NULL ELSE
  CAST((julianday(accepted_at)-julianday(committed_at))*86400000 AS INTEGER) END AS commit_to_acceptance_ms,
  CAST((julianday(hypothetical_restriction_at)-julianday(committed_at))*86400000 AS INTEGER) AS commit_to_hypothetical_restriction_ms
  FROM authority_sync_measurements WHERE organization_id=? AND installation_id=? ORDER BY committed_at,event_id`).bind(org,installation).all<any>();
 return rows.results;
}
