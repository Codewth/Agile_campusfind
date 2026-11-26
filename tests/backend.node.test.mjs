import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { locations } from '../src/lib/data.js';

const tmp=mkdtempSync(join(tmpdir(),'campusfind-test-'));
const dist=join(tmp,'dist');mkdirSync(dist);writeFileSync(join(dist,'index.html'),'<!doctype html><title>CampusFind test</title>');
const app=createApp({dbPath:join(tmp,'test.sqlite'),uploadDir:join(tmp,'uploads'),distDir:dist,seedDemoReports:false});
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
test('campus map location list includes requested blocks and places',()=>{
  for(const name of ['A Block','B Block','K Block','P Block','N Block','Gobbler','Paid Mess','Parking','LRC'])assert.ok(locations.includes(name),`${name} should be available`);
  for(let i=1;i<=12;i++)assert.ok(locations.includes(`C Block C${i}`));
  for(let i=1;i<=6;i++)assert.ok(locations.includes(`D Block D${i}`));
});
test('create account, login and restore session',async()=>{
  const a=await request('POST','/api/auth/register',{name:'Alice Example',email:'ALICE@example.edu',password:'StrongPassword9'},'alice');
  assert.equal(a.httpStatus,201);assert.equal(a.user.email,'alice@example.edu');
  assert.equal((await request('GET','/api/auth/me',null,'alice')).user.displayName,'Alice Example');
  const b=await request('POST','/api/auth/register',{name:'Bob Example',email:'bob@example.edu',password:'DifferentPassword9'},'bob');assert.equal(b.httpStatus,201);
  assert.equal((await request('POST','/api/auth/login',{email:'bob@example.edu',password:'invalid-pass-123'},'bob')).httpStatus,401);
  assert.equal((await request('POST','/api/auth/login',{email:'bob@example.edu',password:'DifferentPassword9'},'bob')).httpStatus,200);
});
test('platform dashboard, map, inventory and assistant APIs',async()=>{
  const map=await request('GET','/api/map');assert.equal(map.httpStatus,200);assert.ok(Array.isArray(map.reports));assert.ok(Array.isArray(map.heatmap));
  const assistant=await request('POST','/api/assistant',{message:'How do I create a report?'},'alice');assert.equal(assistant.httpStatus,200);assert.ok(assistant.answer.includes('Post report'));
  assert.equal((await request('GET','/api/dashboard',null,'alice')).httpStatus,200);
  const inventory=await request('POST','/api/inventory',{name:'Student laptop',category:'Electronics',colour:'Silver',identifyingCode:'PRIVATE-SERIAL-123'},'alice');assert.equal(inventory.httpStatus,201);
  assert.equal((await request('GET','/api/inventory',null,'alice')).inventory.length,1);
  await request('POST','/api/reports',{title:'Green notebook',description:'Lecture notes in a green cover',type:'lost',category:'Books & notes',colour:'Green',location:'Library',incidentDate:'2026-11-20',keywords:'notebook lecture notes'},'alice');
  await request('POST','/api/reports',{title:'Brass key set',description:'Three keys on a blue ring',type:'found',category:'Keys',colour:'Brass',location:'Hostel',incidentDate:'2026-11-21',keywords:'kt keyset keys'},'alice');
  const notebook=await request('POST','/api/assistant',{message:'show all notebook details lost and found'},'alice');assert.equal(notebook.httpStatus,200);assert.ok(notebook.answer.includes('matching report'));assert.ok(notebook.reports.some(r=>r.title==='Green notebook'));assert.ok(notebook.reports.find(r=>r.title==='Green notebook').description.includes('Lecture notes'));
  const kt=await request('POST','/api/assistant',{message:'kt'},'alice');assert.equal(kt.httpStatus,200);assert.ok(kt.reports.length>0);assert.ok(kt.reports.every(r=>r.type==='lost'||r.type==='found'));
});
let reportId,claimId;
test('report requires authentication and validates input',async()=>{
  assert.equal((await request('POST','/api/reports',valid)).httpStatus,401);
  assert.equal((await request('POST','/api/reports',{...valid,title:'A'},'alice')).httpStatus,400);
  const r=await request('POST','/api/reports',valid,'alice');assert.equal(r.httpStatus,201);reportId=r.report.id;
  assert.equal(r.report.ownerId.length,36);assert.equal(r.report.imageUrl,'');
  assert.ok((await request('GET','/api/reports?q=earbuds')).reports.some(item=>item.id===reportId));
  assert.equal((await request('GET',`/api/reports/${reportId}`)).report.title,'Black earbuds');
});
test('public listing does not expose reporter contact details',async()=>{
  const item=(await request('GET',`/api/reports/${reportId}`)).report;
  assert.equal(item.id,reportId);
  assert.equal('email' in item,false);
  assert.equal('reporterEmail' in item,false);
  assert.equal('phone' in item,false);
  assert.equal('studentId' in item,false);
  assert.equal('claims' in item,false);
  assert.equal('flags' in item,false);
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
  assert.equal((await request('GET','/api/reports?q=case')).reports.some(item=>item.id===reportId),false);
  assert.equal((await request('GET','/api/reports?mine=1',null,'alice')).reports.find(r=>r.id===reportId).moderationStatus,'hidden');
  assert.equal((await request('PATCH',`/api/admin/flags/${flags.flags[0].id}`,{status:'reviewed'},'alice')).httpStatus,200);
  assert.equal((await request('PATCH',`/api/admin/reports/${reportId}/moderation`,{status:'visible'},'alice')).httpStatus,200);
  assert.equal((await request('GET',`/api/reports/${reportId}`)).httpStatus,200);
});
test('monthly summary is admin-only, aggregate and validates month',async()=>{
  const month=new Date().toISOString().slice(0,7);
  assert.equal((await request('GET',`/api/admin/summary.csv?month=${month}`,null,'bob')).httpStatus,403);
  assert.equal((await request('GET','/api/admin/summary.csv?month=2026-99',null,'alice')).httpStatus,400);
  const r=await fetch(origin+`/api/admin/summary.csv?month=${month}`,{headers:{Cookie:cookies.alice}});
  assert.equal(r.status,200);
  assert.match(r.headers.get('content-type'),/text\/csv/);
  const csv=await r.text();
  const rows=csv.trim().split('\n');
  assert.equal(rows[0],'month,total,lost,found,resolved,unresolved');
  assert.equal(rows.length,2);
  assert.equal(rows[1].split(',')[0],month);
  assert.equal(rows[1].split(',').length,6);
  assert.equal(csv.includes('@'),false);
  assert.equal(csv.includes('Alice'),false);
  assert.equal(csv.includes('Bob'),false);
});
test('private handover staff checklist requires accepted claim and admin approval',async()=>{
  const uri='/api/admin/handovers',data={reportId,claimId,identityConfirmed:true,descriptionConfirmed:true};
  assert.equal((await request('POST',uri,data,'bob')).httpStatus,403);
  assert.equal((await request('POST',uri,{...data,identityConfirmed:false},'alice')).httpStatus,400);
  assert.equal((await request('GET',uri,null,'bob')).httpStatus,403);
  const approved=await request('POST',uri,data,'alice');
  assert.equal(approved.httpStatus,201);
  assert.equal(approved.signoff.reportId,reportId);
  assert.equal(approved.signoff.claimId,claimId);
  assert.ok(approved.signoff.signedAt);
  assert.equal((await request('POST',uri,data,'alice')).httpStatus,409);
  const records=await request('GET',uri,null,'alice');
  assert.equal(records.httpStatus,200);
  assert.ok(records.signoffs.some(x=>x.claimId===claimId&&x.identityConfirmed&&x.descriptionConfirmed));
  assert.equal(JSON.stringify(records).includes('bob@example.edu'),false);
});
test('delete cascades claims, logout revokes the session',async()=>{
  assert.equal((await request('DELETE',`/api/reports/${reportId}`,null,'alice')).httpStatus,200);
  assert.equal((await request('GET',`/api/reports/${reportId}`)).httpStatus,404);
  await request('POST','/api/auth/logout',{},'alice');
  assert.equal((await request('GET','/api/auth/me',null,'alice')).user,null);
  assert.equal((await request('POST','/api/reports',valid,'alice')).httpStatus,401);
});
test.after(async()=>{await app.close();rmSync(tmp,{recursive:true,force:true});});
