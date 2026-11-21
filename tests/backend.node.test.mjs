import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';

const tmp=mkdtempSync(join(tmpdir(),'campusfind-test-'));
const dist=join(tmp,'dist');mkdirSync(dist);writeFileSync(join(dist,'index.html'),'<!doctype html><title>CampusFind test</title>');
const app=createApp({dbPath:join(tmp,'test.sqlite'),uploadDir:join(tmp,'uploads'),distDir:dist});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${app.server.address().port}`;
const cookies={};
async function request(method,path,body,who){
  const r=await fetch(origin+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookies[who]?{'Cookie':cookies[who]}:{})},body:body?JSON.stringify(body):undefined});
  const data=await r.json();
  const setCookie=r.headers.get('set-cookie');if(who&&setCookie)cookies[who]=setCookie.split(';')[0];
  return {httpStatus:r.status,...data};
}
const valid={title:'Black earbuds',description:'Found next to desks',type:'found',category:'Electronics',colour:'Black',location:'Library',incidentDate:'2026-10-10',keywords:'earbuds'};
test('SPA is served from the same backend origin',async()=>{
  const r=await fetch(origin+'/browse');assert.equal(r.status,200);assert.ok((await r.text()).includes('CampusFind test'));
  assert.equal((await fetch(origin+'/missing.js')).status,404);
});
test('health check',async()=>{const r=await request('GET','/api/health');assert.equal(r.httpStatus,200);assert.equal(r.status,'ok');assert.equal(r.service,'CampusFind API');});
test('create account, login and restore session',async()=>{
  const a=await request('POST','/api/auth/register',{name:'Alice Example',email:'ALICE@example.edu',password:'StrongPassword9'},'alice');
  assert.equal(a.httpStatus,201);assert.equal(a.user.email,'alice@example.edu');
  assert.equal((await request('GET','/api/auth/me',null,'alice')).user.displayName,'Alice Example');
  const b=await request('POST','/api/auth/register',{name:'Bob Example',email:'bob@example.edu',password:'DifferentPassword9'},'bob');assert.equal(b.httpStatus,201);
  assert.equal((await request('POST','/api/auth/login',{email:'bob@example.edu',password:'invalid-pass-123'},'bob')).httpStatus,401);
  assert.equal((await request('POST','/api/auth/login',{email:'bob@example.edu',password:'DifferentPassword9'},'bob')).httpStatus,200);
});
let reportId,claimId;
test('report requires authentication and validates input',async()=>{
  assert.equal((await request('POST','/api/reports',valid)).httpStatus,401);
  assert.equal((await request('POST','/api/reports',{...valid,title:'A'},'alice')).httpStatus,400);
  const r=await request('POST','/api/reports',valid,'alice');assert.equal(r.httpStatus,201);reportId=r.report.id;
  assert.equal(r.report.ownerId.length,36);assert.equal(r.report.imageUrl,'');
  assert.equal((await request('GET','/api/reports?q=earbuds')).reports.length,1);
  assert.equal((await request('GET',`/api/reports/${reportId}`)).report.title,'Black earbuds');
});
test('only owner can edit, change status, delete',async()=>{
  assert.equal((await request('PATCH',`/api/reports/${reportId}`,valid,'bob')).httpStatus,403);
  assert.equal((await request('PATCH',`/api/reports/${reportId}/status`,{status:'resolved'},'bob')).httpStatus,403);
  assert.equal((await request('DELETE',`/api/reports/${reportId}`,null,'bob')).httpStatus,403);
  const edited=await request('PATCH',`/api/reports/${reportId}`,{...valid,title:'Black earbuds case'},'alice');assert.equal(edited.httpStatus,200);
});
test('private claim workflow and safety checks',async()=>{
  assert.equal((await request('POST',`/api/reports/${reportId}/claims`,{note:'I lost my earbuds case in the library.'},'alice')).httpStatus,403);
  const r=await request('POST',`/api/reports/${reportId}/claims`,{note:'I lost my earbuds case in the library.'},'bob');assert.equal(r.httpStatus,201);claimId=r.claim.id;
  assert.equal((await request('POST',`/api/reports/${reportId}/claims`,{note:'Duplicate message request!'},'bob')).httpStatus,409);
  assert.equal((await request('GET','/api/claims?scope=incoming',null,'alice')).claims.length,1);
  assert.equal((await request('GET','/api/claims?scope=incoming',null,'bob')).claims.length,0);
  assert.equal((await request('PATCH',`/api/claims/${claimId}`,{status:'accepted'},'bob')).httpStatus,403);
  assert.equal((await request('PATCH',`/api/claims/${claimId}`,{status:'accepted'},'alice')).httpStatus,200);
  assert.equal((await request('GET',`/api/reports/${reportId}`)).report.status,'claimed');
  assert.equal((await request('POST',`/api/reports/${reportId}/claims`,{note:'Additional claim attempt.'},'bob')).httpStatus,409);
  assert.equal((await request('PATCH',`/api/reports/${reportId}/status`,{status:'resolved'},'alice')).httpStatus,200);
});
test('photo validation and successful upload',async()=>{
  assert.equal((await request('POST','/api/reports',{...valid,imageData:'data:image/png;base64,YWJjZA=='},'alice')).httpStatus,400);
  const fakePng=Buffer.from('89504e470d0a1a0a00000000','hex').toString('base64');
  const r=await request('POST','/api/reports',{...valid,imageData:'data:image/png;base64,'+fakePng},'alice');assert.equal(r.httpStatus,201);
  const response=await fetch(origin+r.report.imageUrl);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
});
test('flags are private and duplicates blocked',async()=>{
  const r=await request('POST',`/api/reports/${reportId}/flag`,{reason:'This listing appears to be misleading.'},'bob');assert.equal(r.httpStatus,201);
  assert.equal((await request('POST',`/api/reports/${reportId}/flag`,{reason:'This listing appears to be misleading.'},'bob')).httpStatus,409);
});
test('moderation requires admin, and hidden reports disappear publicly',async()=>{
  assert.equal((await request('GET','/api/admin/flags',null,'alice')).httpStatus,403);
  assert.equal((await request('PATCH',`/api/admin/reports/${reportId}/moderation`,{status:'hidden'},'bob')).httpStatus,403);
  app.db.prepare("UPDATE users SET role='admin' WHERE email='alice@example.edu'").run();
  const flags=await request('GET','/api/admin/flags',null,'alice');assert.equal(flags.httpStatus,200);assert.ok(flags.flags.length);
  assert.equal((await request('PATCH',`/api/admin/reports/${reportId}/moderation`,{status:'hidden'},'alice')).httpStatus,200);
  assert.equal((await request('GET',`/api/reports/${reportId}`)).httpStatus,404);
  assert.equal((await request('GET',`/api/reports/${reportId}`,null,'alice')).httpStatus,200);
  assert.equal((await request('GET','/api/reports?q=case')).reports.length,0);
  assert.equal((await request('GET','/api/reports?mine=1',null,'alice')).reports.find(r=>r.id===reportId).moderationStatus,'hidden');
  assert.equal((await request('PATCH',`/api/admin/flags/${flags.flags[0].id}`,{status:'reviewed'},'alice')).httpStatus,200);
  assert.equal((await request('PATCH',`/api/admin/reports/${reportId}/moderation`,{status:'visible'},'alice')).httpStatus,200);
  assert.equal((await request('GET',`/api/reports/${reportId}`)).httpStatus,200);
});
test('delete cascades claims, logout revokes the session',async()=>{
  assert.equal((await request('DELETE',`/api/reports/${reportId}`,null,'alice')).httpStatus,200);
  assert.equal((await request('GET',`/api/reports/${reportId}`)).httpStatus,404);
  await request('POST','/api/auth/logout',{},'alice');
  assert.equal((await request('GET','/api/auth/me',null,'alice')).user,null);
  assert.equal((await request('POST','/api/reports',valid,'alice')).httpStatus,401);
});
test.after(async()=>{await app.close();rmSync(tmp,{recursive:true,force:true});});
