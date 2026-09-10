import {describe,it,expect,vi} from 'vitest';
import {githubAppProvider,hashSecret} from '../src/authority/human-identity';
const config={clientId:'app-client',clientSecret:'test-only-secret',callbackUrl:'https://authority.test/v1/authority/human/callback'};
describe('GitHub App contract (mock transport)',()=>{
 it('uses S256, state and exact callback; secrets stay out of authorize URL',async()=>{
  const p=githubAppProvider(config),u=new URL(p.authorize('random-state',await hashSecret('verifier')));
  expect(u.origin).toBe('https://github.com');expect(u.searchParams.get('code_challenge_method')).toBe('S256');
  expect(u.searchParams.get('state')).toBe('random-state');expect(u.searchParams.get('redirect_uri')).toBe(config.callbackUrl);expect(u.href).not.toContain(config.clientSecret);
 });
 it('exchanges only at Backend with verifier and identifies by stable ID',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({access_token:'ghu_fixture',token_type:'bearer',expires_in:28800,refresh_token:'discarded'}))
   .mockResolvedValueOnce(Response.json({id:123,login:'renamed'}));
  const p=githubAppProvider(config,fetcher);expect(await p.exchange('code','verifier')).toEqual({token:'ghu_fixture',expiresIn:28800});
  expect(new URLSearchParams(fetcher.mock.calls[0][1].body).get('code_verifier')).toBe('verifier');
  expect(await p.identify('ghu_fixture')).toEqual({subject:'123',handle:'renamed'});
  expect(fetcher.mock.calls[1][1].redirect).toBe('error');
 });
 it.each([{id:Number.MAX_SAFE_INTEGER+1,login:'x'},{id:0,login:'x'},{id:'123',login:'x'}])('rejects ambiguous provider IDs %j',async body=>{
  await expect(githubAppProvider(config,vi.fn().mockResolvedValue(Response.json(body))).identify('x')).rejects.toThrow('provider_invalid');
 });
 it.each([{error:'bad_verification_code'},{access_token:'ghp_personal',token_type:'bearer'},{access_token:'ghu_x',token_type:'bearer',expires_in:0}])('rejects non-App or invalid grant %j',async body=>{
  await expect(githubAppProvider(config,vi.fn().mockResolvedValue(Response.json(body))).exchange('c','v')).rejects.toThrow('provider_invalid');
 });
 it('distinguishes observed revocation from outage and has no fixture fallback',async()=>{
  await expect(githubAppProvider(config,vi.fn().mockResolvedValue(new Response(null,{status:401}))).identify('x')).rejects.toThrow('provider_revoked');
  await expect(githubAppProvider(config,vi.fn().mockRejectedValue(new Error('network'))).identify('x')).rejects.toThrow('provider_unavailable');
  expect(()=>githubAppProvider({...config,clientSecret:''})).toThrow('configuration_missing');
  expect(()=>githubAppProvider({...config,callbackUrl:'http://bad.test'})).toThrow('configuration_invalid');
 });
});
