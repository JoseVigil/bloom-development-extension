export class HumanIdentityError extends Error {
 constructor(readonly code:string){super(`authority_human_${code}`);}
}
export const randomSecret=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
export function base64url(bytes:Uint8Array):string {return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
export async function hashSecret(value:string):Promise<string>{return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
export interface HumanProvider {
 source:'github-app'|'test-fixture';
 authorize(state:string,challenge:string):string;
 exchange(code:string,verifier:string):Promise<{token:string;expiresIn:number}>;
 identify(token:string):Promise<{subject:string;handle:string}>;
}
export interface GitHubAppConfig {clientId:string;clientSecret:string;callbackUrl:string;}
export function githubAppProvider(config:GitHubAppConfig, transport:typeof fetch=fetch):HumanProvider {
 if(!config.clientId||!config.clientSecret||!config.callbackUrl)throw new HumanIdentityError('configuration_missing');
 const callback=new URL(config.callbackUrl);
 if(callback.protocol!=='https:'||callback.search||callback.hash||callback.username||callback.password)throw new HumanIdentityError('configuration_invalid');
 async function send(url:string,init:RequestInit){
  let response:Response;
  try{response=await transport(url,{...init,redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw new HumanIdentityError('provider_unavailable');}
  if(response.status===401)throw new HumanIdentityError('provider_revoked');
  if(!response.ok)throw new HumanIdentityError('provider_unavailable');
  try{return await response.json() as Record<string,unknown>;}catch{throw new HumanIdentityError('provider_invalid');}
 }
 return {source:'github-app',authorize(state,challenge){
  const url=new URL('https://github.com/login/oauth/authorize');
  url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.callbackUrl,state,code_challenge:challenge,code_challenge_method:'S256'}).toString();return url.href;
 },async exchange(code,verifier){
  if(!code||!verifier)throw new HumanIdentityError('flow_invalid');
  const data=await send('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.callbackUrl,code,code_verifier:verifier}).toString()});
  if(data.error||typeof data.access_token!=='string'||!data.access_token.startsWith('ghu_')||data.token_type!=='bearer'
    ||(data.expires_in!==undefined&&(!Number.isSafeInteger(data.expires_in)||Number(data.expires_in)<=0)))throw new HumanIdentityError('provider_invalid');
  return {token:data.access_token,expiresIn:Math.min(Number(data.expires_in??28800),28800)};
 },async identify(token){
  const data=await send('https://api.github.com/user',{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'User-Agent':'Bloom-Authority','X-GitHub-Api-Version':'2026-03-10'}});
  if(!Number.isSafeInteger(data.id)||Number(data.id)<=0||typeof data.login!=='string')throw new HumanIdentityError('provider_invalid');
  return {subject:String(data.id),handle:data.login};
 }};
}
/**
 * Proveedor de identidad humana para modo fixture (pruebas E2E / desarrollo).
 *
 * Replica, del lado del Backend, el mismo patrón que el Synapse Simulator usa
 * del lado de la extensión: en vez de automatizar la superficie real de un
 * proveedor externo (github.com), inyecta directamente el estado interno
 * post-condición que ese flujo real produciría. Nunca emite una URL de
 * github.com, nunca hace un fetch saliente, y nunca decodifica un token real.
 *
 * Solo queda accesible cuando `configuredAuthorityHumanResponse` decide activar
 * el modo fixture (ver administration-route.ts), lo cual a su vez exige la
 * variable de entorno estricta `AUTHORITY_ALLOW_TEST_FIXTURES==='true'` Y que
 * `human-session-store.ts`'s `permitted()` reciba `allowTestFixtures:true` —
 * doble cierre: selección de provider + flag explícito de sesión.
 */
export function testFixtureProvider():HumanProvider {
 return {source:'test-fixture',authorize(state,challenge){
  const url=new URL('https://fixture.invalid/authorize');
  url.search=new URLSearchParams({state,code_challenge:challenge,code_challenge_method:'S256'}).toString();return url.href;
 },async exchange(code,_verifier){
  if(!code)throw new HumanIdentityError('flow_invalid');
  return {token:code,expiresIn:28800};
 },async identify(token){
  if(!token)throw new HumanIdentityError('provider_invalid');
  return {subject:token,handle:`fixture-${token}`};
 }};
}
