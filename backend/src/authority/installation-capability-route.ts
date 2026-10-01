import { InstallationCapabilityError,loadInstallationCapabilities,updateInstallationCapabilities,type InstallationCapabilityRequest } from './installation-capability';
type VerifiedInstallation={organizationId:string;installationId:string};
export async function readInstallationCapabilityResponse(db:D1Database,request:Request,verified:VerifiedInstallation|null):Promise<Response>{
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
 if(!verified)return reply({error:'installation_auth_required'},401);
 const url=new URL(request.url),requestedInstallation=url.searchParams.get('installation_id');
 if(requestedInstallation!==null&&requestedInstallation!==verified.installationId)return reply({error:'recipient_mismatch'},403);
 const declaration=await loadInstallationCapabilities(db,verified.organizationId,verified.installationId);
 if(!declaration)return reply({error:'authority_installation_capability_unavailable',bootstrapExpectedRevision:'0'},404);
 return reply({organizationId:verified.organizationId,...declaration});
}
export async function installationCapabilityResponse(db:D1Database,body:unknown,verified:{organizationId:string;installationId:string}|null):Promise<Response>{
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
 if(!verified||!body||typeof body!=='object'||Array.isArray(body))return reply({error:'invalid_request'},400);
 const input=body as Record<string,unknown>;
 if(Object.keys(input).sort().join(',')!=='expectedRevision,installationId,organizationId,requestId,signature,supportedAuthoritySchemaVersions,timestamp'
   ||input.organizationId!==verified.organizationId||input.installationId!==verified.installationId||!Array.isArray(input.supportedAuthoritySchemaVersions))return reply({error:'recipient_mismatch'},403);
 try{return reply(await updateInstallationCapabilities(db,input as unknown as InstallationCapabilityRequest));}
 catch(error){if(error instanceof InstallationCapabilityError)return reply({error:error.message},error.code==='revision_conflict'||error.code==='idempotency_conflict'?409:error.code==='invalid_request'?400:403);throw error;}
}
