import http from 'node:http';
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual, createVerify } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { openStore, publicReport, publicUser } from './store.js';
import { fail, reportInput, validateCredentials, validateImage, statuses } from './validation.js';

const SESSION_COOKIE='campusfind_session', WEEK=7*24*3600*1000;
const digest=token=>createHash('sha256').update(token).digest('hex');
const passwordHash=(password,salt)=>scryptSync(password,salt,64).toString('hex');
const now=()=>new Date().toISOString();
const base64UrlJson=value=>{try{return JSON.parse(Buffer.from(value,'base64url').toString('utf8'));}catch{return null;}};
let firebaseCerts=null,firebaseCertsExpiry=0;
async function verifyFirebaseIdToken(idToken){
  if(typeof idToken!=='string'||idToken.length>10000)fail('A valid Firebase sign-in token is required.');
  const parts=idToken.split('.');
  if(parts.length!==3)fail('A valid Firebase sign-in token is required.',401);
  const header=base64UrlJson(parts[0]),payload=base64UrlJson(parts[1]);
  const projectId=process.env.FIREBASE_PROJECT_ID||process.env.VITE_FIREBASE_PROJECT_ID||'jira-bc3f0';
  if(!header||header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid)fail('Invalid Firebase token header.',401);
  if(!payload||payload.iss!==`https://securetoken.google.com/${projectId}`||payload.aud!==projectId||payload.email_verified!==true)fail('Invalid Firebase identity token.',401);
  if(!payload.sub||typeof payload.exp!=='number'||payload.exp*1000<=Date.now())fail('Firebase identity token has expired.',401);
  if(Date.now()>firebaseCertsExpiry){
    let response;
    try{response=await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');}catch{fail('Cannot verify the Firebase identity token.',502);}
    if(!response.ok)fail('Cannot verify the Firebase identity token.',502);
    firebaseCerts=await response.json();
    const cacheControl=response.headers.get('cache-control')||'',match=/max-age=(\d+)/.exec(cacheControl);
    firebaseCertsExpiry=Date.now()+((match?Number(match[1]):300)*1000);
  }
  const certificate=firebaseCerts?.[header.kid];
  if(!certificate)fail('Firebase signing key is unavailable.',401);
  const verifier=createVerify('RSA-SHA256');verifier.update(`${parts[0]}.${parts[1]}`);
  if(!verifier.verify(certificate,Buffer.from(parts[2],'base64url')))fail('Invalid Firebase identity token.',401);
  if(typeof payload.email!=='string'||typeof payload.name!=='string')fail('Firebase account must provide an email and name.',400);
  return {email:payload.email.toLowerCase().trim(),name:payload.name.trim().slice(0,60)};
}
function crc32(buffer){
  let crc=0xffffffff;
  for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function pngChunk(type,data){
  const typeBuffer=Buffer.from(type,'ascii'),length=Buffer.alloc(4),crc=Buffer.alloc(4);
  length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer,data])));
  return Buffer.concat([length,typeBuffer,data,crc]);
}
function createDemoPng(accentIndex){
  const width=480,height=300,pixels=Buffer.alloc(width*height*3);
  const palette=[[37,99,235],[14,165,233],[16,185,129],[245,158,11],[239,68,68],[139,92,246],[236,72,153],[20,184,166],[249,115,22],[99,102,241]];
  const accent=palette[accentIndex%palette.length];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*3;const shade=Math.round(244-(x+y)/(width+height)*18);pixels[i]=shade;pixels[i+1]=shade+5>255?255:shade+5;pixels[i+2]=255;}
  function rect(x1,y1,x2,y2,color){for(let y=Math.max(0,y1);y<Math.min(height,y2);y++)for(let x=Math.max(0,x1);x<Math.min(width,x2);x++){const i=(y*width+x)*3;pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];}}
  function circle(cx,cy,radius,color){for(let y=Math.max(0,cy-radius);y<Math.min(height,cy+radius);y++)for(let x=Math.max(0,cx-radius);x<Math.min(width,cx+radius);x++){if((x-cx)**2+(y-cy)**2<=radius**2){const i=(y*width+x)*3;pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];}}}
  rect(70,45,410,255,[226,232,240]);rect(88,63,392,237,[248,250,252]);
  const kind=accentIndex%5;
  if(kind===0){rect(170,95,310,215,accent);rect(190,115,290,195,[255,255,255]);circle(240,155,28,accent);}
  if(kind===1){circle(240,150,82,accent);circle(240,150,54,[248,250,252]);rect(225,115,255,185,[51,65,85]);}
  if(kind===2){rect(145,115,335,205,accent);rect(165,135,315,185,[248,250,252]);circle(170,160,38,accent);circle(310,160,38,accent);}
  if(kind===3){rect(180,80,300,225,accent);rect(195,95,285,210,[248,250,252]);rect(210,110,270,125,[51,65,85]);rect(210,140,270,155,[51,65,85]);}
  if(kind===4){circle(240,145,76,accent);rect(210,145,270,220,[248,250,252]);rect(228,178,252,220,[51,65,85]);}
  const scanlines=Buffer.alloc(height*(1+width*3));
  for(let y=0;y<height;y++){const offset=y*(1+width*3);scanlines[offset]=0;pixels.copy(scanlines,offset+1,y*width*3,(y+1)*width*3);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(scanlines)),pngChunk('IEND',Buffer.alloc(0))]);
}
function reply(res,status,body,headers={}){
  const payload=JSON.stringify(body);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(payload);
}
async function jsonBody(req){
  const parts=[];let size=0;
  for await(const part of req){size+=part.length;if(size>8*1024*1024)fail('Request too large.',413);parts.push(part);}
  try {return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail('Invalid JSON body.');}
}
export function createApp({dbPath=process.env.DATABASE_PATH||'server/data/campusfind.sqlite',
  uploadDir=process.env.UPLOAD_DIR||'server/data/uploads',distDir=process.env.DIST_DIR||'dist',allowedOrigins=(process.env.CLIENT_ORIGIN||'http://localhost:5173,http://localhost:4173,http://localhost:3001').split(',')}={}){
  const db=openStore(dbPath);mkdirSync(uploadDir,{recursive:true});
  const demoEmail='demo.reports@campusfind.local';
  let demoUser=db.prepare('SELECT * FROM users WHERE email=?').get(demoEmail);
  if(!demoUser){
    const salt=randomBytes(16).toString('hex'),id=randomUUID();
    db.prepare('INSERT INTO users(id,name,email,salt,password_hash,role,created_at) VALUES(?,?,?,?,?,\'member\',?)').run(id,'CampusFind Demo',demoEmail,salt,passwordHash('DemoPass123!',salt),now());
    demoUser=db.prepare('SELECT * FROM users WHERE email=?').get(demoEmail);
  }
  if(db.prepare('SELECT COUNT(*) count FROM reports WHERE owner_id=?').get(demoUser.id).count===0){
    const demos=[
      ['Blue backpack near library','A navy canvas backpack with a silver laptop pocket, charger, and a small green key pouch.','lost','Bags','Navy blue','Library','2026-11-18','blue backpack laptop charger'],
      ['Found silver student ID card','Silver-blue campus card found beside the card reader near the main entrance.','found','ID cards','Silver','Main gate','2026-11-17','student id card campus card'],
      ['Wireless earbuds in black case','Black wireless earbuds in a small charging case with a white charging cable.','lost','Electronics','Black','Cafeteria','2026-11-16','earbuds headphones charging case'],
      ['Set of brass keys','Three brass keys on a red fabric keyring, one with a room tag.','found','Keys','Brass','Hostel','2026-11-15','keys brass keyring room key'],
      ['Calculus textbook','A calculus textbook with a yellow sticky note and initials written inside the cover.','lost','Books & notes','Yellow','Classroom','2026-11-14','calculus textbook maths notes'],
      ['White water bottle','A 750 ml white insulated bottle with a university sticker on the side.','found','Water bottles','White','Sports ground','2026-11-13','water bottle insulated university sticker'],
      ['Black hoodie with initials','A black hooded sweatshirt, size medium, with navy initials on the left sleeve.','lost','Clothing','Black','Auditorium','2026-11-12','black hoodie sweatshirt initials'],
      ['USB-C flash drive','A 128 GB USB-C flash drive in a clear protective sleeve found after lab class.','found','Electronics','Silver','Laboratory','2026-11-11','usb drive flash drive usb-c'],
      ['Green notebook bundle','Two green notebooks tied together with a rubber band and lecture summaries inside.','lost','Books & notes','Green','Library','2026-11-10','green notebooks lecture notes'],
      ['Gold smartwatch','A square gold smartwatch with a dark sport strap and a cracked screen protector.','found','Accessories','Gold','Cafeteria','2026-11-09','smartwatch watch gold sport strap'],
      ['Red umbrella','A compact red umbrella with a wooden handle and one slightly faded panel.','lost','Accessories','Red','Main gate','2026-11-08','red umbrella rain umbrella'],
      ['Car and room key set','Two keys attached to a black carabiner, one with a blue plastic cap.','found','Keys','Black','Hostel','2026-11-07','key set car keys room key carabiner'],
      ['Grey laptop sleeve','A padded 14-inch grey laptop sleeve with a small white zipper pull.','lost','Bags','Grey','Laboratory','2026-11-06','laptop sleeve padded 14 inch'],
      ['Pink sunglasses','Round pink sunglasses in a hard black protective case.','found','Accessories','Pink','Sports ground','2026-11-05','sunglasses glasses pink round'],
      ['Mechanical keyboard','A compact mechanical keyboard with blue switches and a detachable USB cable.','lost','Electronics','White','Classroom','2026-11-04','mechanical keyboard usb blue switches'],
      ['Blue lunch box','A two-tier blue lunch box with a matching spoon and a small carry handle.','found','Other','Blue','Cafeteria','2026-11-03','lunch box blue spoon'],
      ['Orange running shoes','Pair of orange and grey running shoes, size UK 8, in a small drawstring bag.','lost','Clothing','Orange','Sports ground','2026-11-02','running shoes orange grey size 8'],
      ['Library card in clear holder','A library card and replacement barcode stored in a clear plastic holder.','found','ID cards','Clear','Library','2026-11-01','library card barcode clear holder'],
      ['Portable phone charger','A slim 10,000 mAh power bank with a braided USB-C cable.','lost','Electronics','Black','Auditorium','2026-10-31','power bank phone charger usb-c'],
      ['Brown leather wallet','A brown leather wallet containing a transit card and two paper receipts.','found','Accessories','Brown','Main gate','2026-10-30','wallet leather transit card']
    ];
    db.exec('BEGIN IMMEDIATE');
    try{
      for(let i=0;i<demos.length;i++){
        const [title,description,type,category,colour,location,incidentDate,keywords]=demos[i];
        const id=randomUUID(),filename=`${randomUUID()}.png`,ts=new Date(Date.UTC(2026,10,19-i,12,0,0)).toISOString();
        writeFileSync(join(uploadDir,filename),createDemoPng(i),{flag:'wx'});
        db.prepare(`INSERT INTO reports(id,owner_id,title,description,type,category,colour,location,incident_date,keywords,status,image_file,image_mime,moderation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(id,demoUser.id,title,description,type,category,colour,location,incidentDate,keywords,i%7===6?'claimed':'open',filename,'image/png','visible',ts,ts);
      }
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  const staticRoot=resolve(distDir);
  const attempts=new Map();
  function cookie(value,clear=false,req){const https=req?.socket?.encrypted||req?.headers['x-forwarded-proto']?.split(',')[0]?.trim()==='https';return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; ${https?'Secure; ':''}Max-Age=${clear?0:604800}`;}
  function userFromRequest(req){
    const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${SESSION_COOKIE}=`));
    const token=raw?.slice(SESSION_COOKIE.length+1);
    if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
    return db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(digest(token),Date.now())||null;
  }
  function requireUser(req){const user=userFromRequest(req);if(!user)fail('Please sign in to continue.',401);return user;}
  function session(req,res,user){
    const token=randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),user.id,Date.now()+WEEK);
    res.setHeader('Set-Cookie',cookie(token,false,req));
  }
  function getReport(id){const report=db.prepare('SELECT * FROM reports WHERE id=?').get(id);if(!report)fail('Report not found.',404);return report;}
  function requireAdmin(req){const user=requireUser(req);if(user.role!=='admin')fail('Administrator permission required.',403);return user;}
  function ownReport(id,user){const row=getReport(id);if(row.owner_id!==user.id)fail('Only the report owner may do that.',403);return row;}
  function storeImage(data){const img=validateImage(data);if(!img)return null;
    const filename=`${randomUUID()}.${img.ext}`;writeFileSync(join(uploadDir,filename),img.bytes,{flag:'wx'});return {file:filename,mime:img.mime};
  }
  function removeImage(filename){if(filename)try{unlinkSync(join(uploadDir,filename));}catch{}}
  const server=http.createServer(async(req,res)=>{
    try{
      const host=req.headers.host||'localhost';
      const url=new URL(req.url,`http://${host}`);
      const path=url.pathname;
      const method=req.method;
      const origin=req.headers.origin;
      if(origin){let sameHost=false;try{sameHost=new URL(origin).host===host;}catch{}if(!sameHost&&!allowedOrigins.includes(origin))fail('Origin not allowed.',403);}
      if(method==='OPTIONS'){res.writeHead(204,{'Allow':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});return res.end();}
      if(path==='/api/health'&&method==='GET')return reply(res,200,{status:'ok',service:'CampusFind API',database:'sqlite'});
      if(path==='/api/auth/me'&&method==='GET')return reply(res,200,{user:publicUser(userFromRequest(req))});
      if(path==='/api/auth/register'&&method==='POST'){
        const input=validateCredentials(await jsonBody(req),true);
        const campusDomain=process.env.CAMPUS_EMAIL_DOMAIN?.trim().toLowerCase();
        if(campusDomain&&!input.email.endsWith(`@${campusDomain}`))fail('Use an approved campus email address.');
        if(db.prepare('SELECT id FROM users WHERE email=?').get(input.email))fail('An account already uses this email.',409);
        const id=randomUUID(),salt=randomBytes(16).toString('hex');
        db.prepare('INSERT INTO users(id,name,email,salt,password_hash,created_at) VALUES(?,?,?,?,?,?)').run(id,input.name,input.email,salt,passwordHash(input.password,salt),now());
        const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);session(req,res,user);return reply(res,201,{user:publicUser(user)});
      }
      if(path==='/api/auth/login'&&method==='POST'){
        const key=req.socket.remoteAddress||'unknown',entry=attempts.get(key)||{count:0,until:Date.now()+900000};
        if(Date.now()>entry.until){entry.count=0;entry.until=Date.now()+900000;}
        if(entry.count>=10)fail('Too many login attempts. Try later.',429);
        const {email,password}=validateCredentials(await jsonBody(req));
        const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
        const expected=user?.password_hash||passwordHash('dummy-password','00000000000000000000000000000000');
        const received=passwordHash(password,user?.salt||'00000000000000000000000000000000');
        if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(received,'hex'))){entry.count++;attempts.set(key,entry);fail('Invalid email or password.',401);}
        attempts.delete(key);db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());session(req,res,user);return reply(res,200,{user:publicUser(user)});
      }
      if(path==='/api/auth/logout'&&method==='POST'){
        const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length+1);
        if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
        res.setHeader('Set-Cookie',cookie('',true,req));return reply(res,200,{ok:true});
      }
      if(path==='/api/auth/firebase'&&method==='POST'){
        const body=await jsonBody(req),identity=await verifyFirebaseIdToken(body.idToken);
        if(!identity.email||!identity.name)fail('The Google account must provide a name and verified email.',400);
        const campusDomain=process.env.CAMPUS_EMAIL_DOMAIN?.trim().toLowerCase();
        if(campusDomain&&!identity.email.endsWith(`@${campusDomain}`))fail('Use an approved campus email address.');
        let user=db.prepare('SELECT * FROM users WHERE email=?').get(identity.email);
        if(!user){
          const id=randomUUID(),salt=randomBytes(16).toString('hex');
          db.prepare('INSERT INTO users(id,name,email,salt,password_hash,created_at) VALUES(?,?,?,?,?,?)').run(id,identity.name,identity.email,salt,passwordHash(randomBytes(32).toString('hex'),salt),now());
          user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
        }
        session(req,res,user);return reply(res,200,{user:publicUser(user)});
      }
      if(path==='/api/reports'&&method==='GET'){
        let sql="SELECT * FROM reports WHERE moderation_status='visible'";const args=[];
        const type=url.searchParams.get('type'),category=url.searchParams.get('category'),status=url.searchParams.get('status');
        if(type&&['lost','found'].includes(type)){sql+=' AND type=?';args.push(type);}
        if(category){sql+=' AND category=?';args.push(category);}
        if(status&&statuses.includes(status)){sql+=' AND status=?';args.push(status);}
        if(url.searchParams.get('mine')==='1'){sql=sql.replace("moderation_status='visible'","(moderation_status='visible' OR owner_id=?)");args.unshift(requireUser(req).id);sql+=' AND owner_id=?';args.push(args[0]);}
        const search=url.searchParams.get('q')?.trim();
        if(search){sql+=' AND (title LIKE ? OR description LIKE ? OR keywords LIKE ? OR location LIKE ?)';const escaped=search.slice(0,80).replace(/[\\%_]/g,'\\$&');args.push(...Array(4).fill(`%${escaped}%`));sql=sql.replaceAll(' LIKE ?',' LIKE ? ESCAPE \'\\\'');}
        const limit=Math.max(1,Math.min(500,Number(url.searchParams.get('limit'))||200)),page=Math.max(1,Math.min(10000,Number(url.searchParams.get('page'))||1));
        sql+=' ORDER BY created_at DESC LIMIT ? OFFSET ?';args.push(limit,(page-1)*limit);
        return reply(res,200,{reports:db.prepare(sql).all(...args).map(publicReport),page,limit});
      }
      if(path==='/api/reports'&&method==='POST'){
        const user=requireUser(req),raw=await jsonBody(req),input=reportInput(raw);
        const image=storeImage(raw.imageData),id=randomUUID(),ts=now();
        try{db.prepare(`INSERT INTO reports(id,owner_id,title,description,type,category,colour,location,incident_date,keywords,status,image_file,image_mime,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?)`).run(id,user.id,input.title,input.description,input.type,input.category,input.colour,input.location,input.incidentDate,input.keywords,image?.file||'',image?.mime||'',ts,ts);}
        catch(e){removeImage(image?.file);throw e;}
        return reply(res,201,{report:publicReport(getReport(id))});
      }
      const imageMatch=/^\/api\/images\/([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(path);
      if(imageMatch&&method==='GET'){
        const filename=`${imageMatch[1]}.${imageMatch[2]}`,record=db.prepare('SELECT image_mime,moderation_status,owner_id FROM reports WHERE image_file=?').get(filename);
        if(!record||record.moderation_status==='hidden'&&userFromRequest(req)?.id!==record.owner_id&&userFromRequest(req)?.role!=='admin')fail('Image not found.',404);
        let contents;try{contents=readFileSync(join(uploadDir,filename));}catch{fail('Image not found.',404);}
        res.writeHead(200,{'Content-Type':record.image_mime,'Content-Length':contents.length,'X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=3600'});return res.end(contents);
      }
      const match=/^\/api\/reports\/([a-f0-9-]{36})(?:\/(status|claims|flag))?$/.exec(path);
      if(match){
        const [,id,action]=match;
        if(!action&&method==='GET'){const row=getReport(id);if(row.moderation_status==='hidden'&&userFromRequest(req)?.id!==row.owner_id&&userFromRequest(req)?.role!=='admin')fail('Report not found.',404);return reply(res,200,{report:publicReport(row)});}
        if(!action&&method==='PATCH'){
          const user=requireUser(req),old=ownReport(id,user),raw=await jsonBody(req),input=reportInput(raw);
          const image=storeImage(raw.imageData);
          try{db.prepare(`UPDATE reports SET title=?,description=?,type=?,category=?,colour=?,location=?,incident_date=?,keywords=?,image_file=?,image_mime=?,updated_at=? WHERE id=?`).run(input.title,input.description,input.type,input.category,input.colour,input.location,input.incidentDate,input.keywords,image?.file||old.image_file,image?.mime||old.image_mime,now(),id);}catch(e){removeImage(image?.file);throw e;}
          if(image)removeImage(old.image_file);
          return reply(res,200,{report:publicReport(getReport(id))});
        }
        if(!action&&method==='DELETE'){
          const user=requireUser(req),old=ownReport(id,user);
          db.prepare('DELETE FROM reports WHERE id=?').run(id);removeImage(old.image_file);return reply(res,200,{ok:true});
        }
        if(action==='status'&&method==='PATCH'){
          const user=requireUser(req);ownReport(id,user);const raw=await jsonBody(req);
          if(!statuses.includes(raw.status))fail('Invalid status.');
          db.prepare('UPDATE reports SET status=?,updated_at=? WHERE id=?').run(raw.status,now(),id);
          return reply(res,200,{report:publicReport(getReport(id))});
        }
        if(action==='claims'&&method==='POST'){
          const user=requireUser(req),report=getReport(id),body=await jsonBody(req);
          if(report.owner_id===user.id)fail('You cannot claim your own report.',403);
          if(report.status!=='open'||report.moderation_status==='hidden')fail('This report is not accepting claims.',409);
          if(typeof body.note!=='string'||body.note.trim().length<10||body.note.trim().length>500)fail('Describe your claim in 10–500 characters.');
          const claimId=randomUUID(),ts=now();
          try{db.prepare('INSERT INTO claims(id,report_id,requester_id,note,status,created_at,updated_at) VALUES(?,?,?, ?,?,?,?)').run(claimId,id,user.id,body.note.trim(),'pending',ts,ts);}
          catch(e){if(String(e).includes('UNIQUE'))fail('You have already submitted a claim for this report.',409);throw e;}
          return reply(res,201,{claim:{id:claimId,status:'pending'}});
        }
        if(action==='flag'&&method==='POST'){
          const user=requireUser(req),body=await jsonBody(req);getReport(id);
          if(typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.trim().length>500)fail('Reason must be 10–500 characters.');
          try{db.prepare('INSERT INTO flags(id,report_id,reporter_id,reason,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),id,user.id,body.reason.trim(),now());}
          catch(e){if(String(e).includes('UNIQUE'))fail('Already reported to moderation.',409);throw e;}
          return reply(res,201,{ok:true,message:'Flag recorded for campus review.'});
        }
      }
      if(path==='/api/admin/summary.csv'&&method==='GET'){
        requireAdmin(req);
        const month=url.searchParams.get('month')||new Date().toISOString().slice(0,7);
        if(!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month))fail('Invalid month; use YYYY-MM.',400);
        const totals=db.prepare(`SELECT COUNT(*) total,
          SUM(CASE WHEN type='lost' THEN 1 ELSE 0 END) lost,
          SUM(CASE WHEN type='found' THEN 1 ELSE 0 END) found,
          SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) resolved,
          SUM(CASE WHEN status!='resolved' THEN 1 ELSE 0 END) unresolved
          FROM reports WHERE substr(created_at,1,7)=?`).get(month);
        const csv='month,total,lost,found,resolved,unresolved\\n'
          +[month,totals.total,totals.lost,totals.found,totals.resolved,totals.unresolved].map(v=>v??0).join(',')+'\\n';
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="campusfind-summary-${month}.csv"`,'Cache-Control':'private, no-store'});
        return res.end(csv);
      }
      if(path==='/api/admin/flags'&&method==='GET'){
        requireAdmin(req);const rows=db.prepare(`SELECT f.*,r.title report_title FROM flags f JOIN reports r ON r.id=f.report_id ORDER BY f.created_at DESC LIMIT 200`).all();
        return reply(res,200,{flags:rows.map(f=>({id:f.id,reportId:f.report_id,reportTitle:f.report_title,reason:f.reason,status:f.status,createdAt:f.created_at}))});
      }
      const modFlag=/^\/api\/admin\/flags\/([a-f0-9-]{36})$/.exec(path);
      if(modFlag&&method==='PATCH'){requireAdmin(req);const body=await jsonBody(req);if(!['reviewed','dismissed'].includes(body.status))fail('Invalid flag decision.');const result=db.prepare('UPDATE flags SET status=? WHERE id=?').run(body.status,modFlag[1]);if(!result.changes)fail('Flag not found.',404);return reply(res,200,{ok:true});}
      const modReport=/^\/api\/admin\/reports\/([a-f0-9-]{36})\/moderation$/.exec(path);
      if(modReport&&method==='PATCH'){requireAdmin(req);const body=await jsonBody(req);if(!['visible','hidden'].includes(body.status))fail('Invalid moderation status.');const result=db.prepare('UPDATE reports SET moderation_status=?,updated_at=? WHERE id=?').run(body.status,now(),modReport[1]);if(!result.changes)fail('Report not found.',404);return reply(res,200,{ok:true});}
      if(path==='/api/claims'&&method==='GET'){
        const user=requireUser(req),scope=url.searchParams.get('scope')==='incoming'?'incoming':'outgoing';
        const rows=scope==='incoming'?db.prepare(`SELECT c.*,r.title report_title,r.owner_id,u.name requester_name FROM claims c JOIN reports r ON r.id=c.report_id JOIN users u ON u.id=c.requester_id WHERE r.owner_id=? ORDER BY c.created_at DESC`).all(user.id):
          db.prepare(`SELECT c.*,r.title report_title,r.owner_id,u.name requester_name FROM claims c JOIN reports r ON r.id=c.report_id JOIN users u ON u.id=c.requester_id WHERE c.requester_id=? ORDER BY c.created_at DESC`).all(user.id);
        return reply(res,200,{claims:rows.map(r=>({id:r.id,reportId:r.report_id,title:r.report_title,note:r.note,status:r.status,requesterName:scope==='incoming'?r.requester_name:undefined,createdAt:r.created_at}))});
      }
      const claim=/^\/api\/claims\/([a-f0-9-]{36})$/.exec(path);
      if(claim&&method==='PATCH'){
        const user=requireUser(req),body=await jsonBody(req),id=claim[1];
        const row=db.prepare('SELECT c.*,r.owner_id,r.status report_status FROM claims c JOIN reports r ON r.id=c.report_id WHERE c.id=?').get(id);
        if(!row)fail('Claim not found.',404);
        const isOwner=row.owner_id===user.id,isRequester=row.requester_id===user.id;
        if((body.status==='cancelled'&&!isRequester)||(['accepted','rejected'].includes(body.status)&&!isOwner))fail('You cannot change this claim.',403);
        if(!['cancelled','accepted','rejected'].includes(body.status))fail('Invalid claim decision.');
        if(row.status!=='pending')fail('This claim has already been reviewed.',409);
        if(body.status==='accepted'&&row.report_status!=='open')fail('This report is no longer open.',409);
        db.exec('BEGIN IMMEDIATE');
        try{
          db.prepare('UPDATE claims SET status=?,updated_at=? WHERE id=?').run(body.status,now(),id);
          if(body.status==='accepted'){
            db.prepare(`UPDATE reports SET status='claimed',updated_at=? WHERE id=?`).run(now(),row.report_id);
            db.prepare(`UPDATE claims SET status='rejected',updated_at=? WHERE report_id=? AND id<>? AND status='pending'`).run(now(),row.report_id,id);
          }
          db.exec('COMMIT');
        }catch(e){db.exec('ROLLBACK');throw e;}
        return reply(res,200,{ok:true,status:body.status});
      }
      // One-process deployment: serve the Vite build and SPA routes from this server.
      if(method==='GET'&&path!=='/api'&&!path.startsWith('/api/')&&existsSync(join(staticRoot,'index.html'))){
        let candidate;
        try{candidate=resolve(staticRoot,'.'+decodeURIComponent(path));}catch{fail('Invalid path.',400);}
        const rel=relative(staticRoot,candidate);
        if(rel.startsWith('..')||rel==='..'||rel.startsWith('/')||rel.includes('\\'))fail('Invalid path.',400);
        const hasFile=existsSync(candidate)&&statSync(candidate).isFile();
        const file=hasFile?candidate:extname(path)?null:join(staticRoot,'index.html');
        if(!file)fail('File not found.',404);
        const ext=extname(file).toLowerCase(),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'}[ext]||'application/octet-stream';
        res.writeHead(200,{'Content-Type':mime,'Content-Length':statSync(file).size,'X-Content-Type-Options':'nosniff','Cache-Control':ext==='.html'?'no-cache':'public,max-age=86400'});
        return createReadStream(file).pipe(res);
      }
      fail('Endpoint not found.',404);
    }catch(e){
      const code=Number.isInteger(e.status)?e.status:500;
      if(code===500)console.error('[CampusFind API]',e);
      if(!res.headersSent)reply(res,code,{error:code===500?'Internal server error.':e.message});else res.end();
    }
  });
  return {server,db,close:()=>new Promise((resolve,reject)=>server.close(err=>{db.close();err?reject(err):resolve();}))};
}
