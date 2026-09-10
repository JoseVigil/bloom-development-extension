import type { AuthorityNotice } from "./sync-store";

/** Durable per-organization queue. Its values are hints only; clients must pull signed authority. */
export class AuthoritySyncObject {
 constructor(private readonly state:DurableObjectState){}
 async fetch(request:Request):Promise<Response>{
  const url=new URL(request.url);
  if(request.method==="POST"&&url.pathname==="/notice"){
   const notice=await request.json<AuthorityNotice>();
   const key=`${notice.event_id}:${notice.installation_id}`;
   await this.state.storage.put(key,notice);
   const retained=await this.state.storage.list<AuthorityNotice>();
   const cutoff=Date.parse(notice.committed_at)-24*60*60*1000;
   const stale=[...retained.entries()].filter(([,value])=>Date.parse(value.committed_at)<cutoff).map(([stored])=>stored);
   if(stale.length)await this.state.storage.delete(stale);
   return Response.json({accepted:true},{status:202});
  }
  if(request.method==="GET"&&url.pathname==="/notice"){
   const installation=url.searchParams.get("installation_id");
   if(!installation)return Response.json({error:"installation_required"},{status:400});
   const entries=await this.state.storage.list<AuthorityNotice>();
   const notices=[...entries.values()].filter(n=>n.installation_id===installation)
    .sort((a,b)=>a.committed_at.localeCompare(b.committed_at)||a.event_id.localeCompare(b.event_id));
   return new Response(notices.map(n=>JSON.stringify(n)).join("\n")+(notices.length?"\n":""),
    {headers:{"Content-Type":"application/x-ndjson","Cache-Control":"no-store"}});
  }
  return new Response("not found",{status:404});
 }
}
