import http from 'node:http';
import { randomBytes, randomUUID, createHash, scryptSync, timingSafeEqual, createVerify } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync, statSync, createReadStream } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { openStore, publicReport, publicUser } from './store.js';
import { fail, reportInput, validateCredentials, validateImage, profileInput, statuses } from './validation.js';

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
  uploadDir=process.env.UPLOAD_DIR||'server/data/uploads',distDir=process.env.DIST_DIR||'dist',seedDemoReports=true,allowedOrigins=(process.env.CLIENT_ORIGIN||'http://localhost:5173,http://localhost:4173,http://localhost:3001').split(',')}={}){
  const db=openStore(dbPath);mkdirSync(uploadDir,{recursive:true});
  const demoEmail='demo.reports@campusfind.local';
  let demoUser=db.prepare('SELECT * FROM users WHERE email=?').get(demoEmail);
  if(!demoUser){
    const salt=randomBytes(16).toString('hex'),id=randomUUID();
    db.prepare('INSERT INTO users(id,name,email,salt,password_hash,role,created_at) VALUES(?,?,?,?,?,\'member\',?)').run(id,'CampusFind Demo',demoEmail,salt,passwordHash('DemoPass123!',salt),now());
    demoUser=db.prepare('SELECT * FROM users WHERE email=?').get(demoEmail);
  }
  if(seedDemoReports && db.prepare('SELECT COUNT(*) count FROM reports WHERE owner_id=?').get(demoUser.id).count===0){
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
  function notify(userId,type,title,body='',link=''){db.prepare(`INSERT INTO notifications(id,user_id,type,title,body,link,created_at) VALUES(?,?,?,?,?,?,?)`).run(randomUUID(),userId,type,title,body,link,now());}
  function audit(actorId,action,entityType,entityId='',detail='',req){db.prepare(`INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,detail,ip_address,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(randomUUID(),actorId||null,action,entityType,entityId,detail,req?.socket?.remoteAddress||'',now());}
  function privateProfile(row){return {uid:row.id,displayName:row.name,email:row.email,aboutMe:row.about_me||'',department:row.department||'',yearOfStudy:row.year_of_study||'',updatedAt:row.profile_updated_at||row.created_at};}
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
      if(path==='/api/profile'&&method==='GET'){
        const user=requireUser(req);
        return reply(res,200,{profile:privateProfile(user)});
      }
      if(path==='/api/profile'&&method==='PATCH'){
        const user=requireUser(req),input=profileInput(await jsonBody(req)),updatedAt=now();
        db.prepare(`UPDATE users SET name=?,about_me=?,department=?,year_of_study=?,profile_updated_at=? WHERE id=?`)
          .run(input.name,input.aboutMe,input.department,input.yearOfStudy,updatedAt,user.id);
        const updated=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
        audit(user.id,'profile.update','user',user.id,'Profile details updated',req);
        return reply(res,200,{profile:privateProfile(updated),user:publicUser(updated)});
      }
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
        const itemNumber=`CF-${id.slice(0,8).toUpperCase()}`,expiresAt=new Date(Date.now()+45*86400000).toISOString();
        try{db.prepare(`INSERT INTO reports(id,owner_id,title,description,type,category,colour,location,incident_date,keywords,status,image_file,image_mime,campus_zone,latitude,longitude,item_number,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,?,?, ?,?)`).run(id,user.id,input.title,input.description,input.type,input.category,input.colour,input.location,input.incidentDate,input.keywords,image?.file||'',image?.mime||'',input.campusZone,input.latitude,input.longitude,itemNumber,expiresAt,ts,ts);}
        catch(e){removeImage(image?.file);throw e;}
        const opposite=db.prepare(`SELECT * FROM reports WHERE type<>? AND status='open' AND moderation_status='visible' AND owner_id<>?`).all(input.type,user.id);
        for(const candidate of opposite){
          const sameCategory=input.category.toLowerCase()===candidate.category.toLowerCase();
          const sameLocation=input.location.toLowerCase()===candidate.location.toLowerCase();
          if(sameCategory||sameLocation){
            notify(candidate.owner_id,'match','Potential item match',`${input.title} may match ${candidate.title}. Review the estimated match before making a claim.`,`/items/${id}`);
          }
        }
        db.prepare(`INSERT INTO report_events(id,report_id,actor_id,type,detail,created_at) VALUES(?,?,?,?,?,?)`).run(randomUUID(),id,user.id,'created','Report submitted',ts);
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
          try{db.prepare(`UPDATE reports SET title=?,description=?,type=?,category=?,colour=?,location=?,incident_date=?,keywords=?,image_file=?,image_mime=?,campus_zone=?,latitude=?,longitude=?,updated_at=? WHERE id=?`).run(input.title,input.description,input.type,input.category,input.colour,input.location,input.incidentDate,input.keywords,image?.file||old.image_file,image?.mime||old.image_mime,input.campusZone,input.latitude,input.longitude,now(),id);}catch(e){removeImage(image?.file);throw e;}
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
          const ts=now();db.prepare('UPDATE reports SET status=?,updated_at=? WHERE id=?').run(raw.status,ts,id);
          db.prepare(`INSERT INTO report_events(id,report_id,actor_id,type,detail,created_at) VALUES(?,?,?,?,?,?)`).run(randomUUID(),id,user.id,'status',`Status changed to ${raw.status}`,ts);
          notify(user.id,'status','Report status updated',`Your report is now marked ${raw.status}.`,`/items/${id}`);
          audit(user.id,'report.status','report',id,`Status changed to ${raw.status}`,req);
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
          notify(report.owner_id,'claim','New ownership claim',`A claim was submitted for ${report.title}.`,`/items/${id}`);
          audit(user.id,'claim.submit','report',id,'Ownership claim submitted',req);
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
      if(path==='/api/admin/handovers'&&method==='GET'){
        requireAdmin(req);
        const rows=db.prepare('SELECT id,report_id,claim_id,staff_user_id,identity_confirmed,description_confirmed,signed_at FROM handover_checks ORDER BY signed_at DESC LIMIT 100').all();
        return reply(res,200,{signoffs:rows.map(x=>({id:x.id,reportId:x.report_id,claimId:x.claim_id,staffUserId:x.staff_user_id,identityConfirmed:!!x.identity_confirmed,descriptionConfirmed:!!x.description_confirmed,signedAt:x.signed_at}))});
      }
      if(path==='/api/admin/handovers'&&method==='POST'){
        const staff=requireAdmin(req),body=await jsonBody(req);
        if(body.identityConfirmed!==true||body.descriptionConfirmed!==true)fail('Both staff checks are required before sign-off.',400);
        if(typeof body.reportId!=='string'||typeof body.claimId!=='string')fail('Report and claim identifiers are required.',400);
        const claim=db.prepare('SELECT id,report_id,status FROM claims WHERE id=? AND report_id=?').get(body.claimId,body.reportId);
        if(!claim||!['accepted','approved'].includes(claim.status))fail('A verified accepted claim is required for handover.',409);
        const id=randomUUID(),signedAt=now();
        try{db.prepare('INSERT INTO handover_checks(id,report_id,claim_id,staff_user_id,identity_confirmed,description_confirmed,signed_at) VALUES(?,?,?,?,1,1,?)').run(id,body.reportId,body.claimId,staff.id,signedAt);}
        catch(e){if(String(e).includes('UNIQUE'))fail('This claim already has a handover sign-off.',409);throw e;}
        return reply(res,201,{signoff:{id,reportId:body.reportId,claimId:body.claimId,staffUserId:staff.id,signedAt}});
      }
      if(path==='/api/admin/summary.csv'&&method==='GET'){
        requireAdmin(req);
        const month=url.searchParams.get('month')||new Date().toISOString().slice(0,7);
        if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail('Invalid month; use YYYY-MM.',400);
        const totals=db.prepare(`SELECT COUNT(*) total,
          SUM(CASE WHEN type='lost' THEN 1 ELSE 0 END) lost,
          SUM(CASE WHEN type='found' THEN 1 ELSE 0 END) found,
          SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) resolved,
          SUM(CASE WHEN status!='resolved' THEN 1 ELSE 0 END) unresolved
          FROM reports WHERE substr(created_at,1,7)=?`).get(month);
        const csv='month,total,lost,found,resolved,unresolved\n'
          +[month,totals.total,totals.lost,totals.found,totals.resolved,totals.unresolved].map(v=>v??0).join(',')+'\n';
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
        if((body.status==='cancelled'&&!isRequester)||(['under_review','accepted','approved','rejected','recovered'].includes(body.status)&&!isOwner))fail('You cannot change this claim.',403);
        if(!['cancelled','under_review','accepted','approved','rejected','recovered'].includes(body.status))fail('Invalid claim decision.');
        if(row.status==='recovered'||row.status==='rejected'||row.status==='cancelled')fail('This claim is already final.',409);
        if(['accepted','approved'].includes(body.status)&&row.report_status!=='open')fail('This report is no longer open.',409);
        db.exec('BEGIN IMMEDIATE');
        try{
          db.prepare('UPDATE claims SET status=?,updated_at=? WHERE id=?').run(body.status,now(),id);
          if(['accepted','approved'].includes(body.status)){
            db.prepare(`UPDATE reports SET status='claimed',updated_at=? WHERE id=?`).run(now(),row.report_id);
            db.prepare(`UPDATE claims SET status='rejected',updated_at=? WHERE report_id=? AND id<>? AND status IN ('pending','under_review')`).run(now(),row.report_id,id);
          }
          if(body.status==='recovered'){
            db.prepare(`UPDATE reports SET status='resolved',updated_at=? WHERE id=?`).run(now(),row.report_id);
          }
          db.exec('COMMIT');
        }catch(e){db.exec('ROLLBACK');throw e;}
        notify(row.requester_id,'claim',`Claim ${body.status.replace('_',' ')}`,`The status of your ownership claim changed to ${body.status.replace('_',' ')}.`,`/my-reports`);
        audit(user.id,'claim.update','claim',id,`Status changed to ${body.status}`,req);
        return reply(res,200,{ok:true,status:body.status});
      }
      if(path==='/api/dashboard'&&method==='GET'){
        const user=requireUser(req);
        const reports=db.prepare(`SELECT * FROM reports WHERE owner_id=?`).all(user.id);
        const saved=db.prepare(`SELECT COUNT(*) count FROM saved_reports WHERE user_id=?`).get(user.id).count;
        const unread=db.prepare(`SELECT COUNT(*) count FROM notifications WHERE user_id=? AND read_at IS NULL`).get(user.id).count;
        const activeLost=reports.filter(r=>r.status==='open'&&r.type==='lost').length;
        const activeFound=reports.filter(r=>r.status==='open'&&r.type==='found').length;
        const recovered=reports.filter(r=>r.status==='resolved').length;
        const mine=reports.filter(r=>r.status==='open');
        let potentialMatches=0;
        for(const r of mine){const opposite= db.prepare(`SELECT * FROM reports WHERE status='open' AND moderation_status='visible' AND type<>?`).all(r.type);for(const c of opposite){if(c.owner_id!==user.id)potentialMatches++;}}
        const categoryRows=db.prepare(`SELECT category,COUNT(*) count FROM reports WHERE owner_id=? GROUP BY category ORDER BY count DESC`).all(user.id).map(r=>({name:r.category,count:r.count}));
        const statusRows=db.prepare(`SELECT status,COUNT(*) count FROM reports WHERE owner_id=? GROUP BY status`).all(user.id).map(r=>({name:r.status,count:r.count}));
        return reply(res,200,{stats:{total:reports.length,activeLost,activeFound,recovered,potentialMatches,saved,unread},categoryData:categoryRows,statusData:statusRows,recent:reports.sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,8).map(publicReport)});
      }
      if(path==='/api/notifications'&&method==='GET'){
        const user=requireUser(req);const rows=db.prepare(`SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100`).all(user.id);
        return reply(res,200,{notifications:rows.map(r=>({id:r.id,type:r.type,title:r.title,body:r.body,link:r.link,read:Boolean(r.read_at),createdAt:r.created_at}))});
      }
      const notificationRead=/^\/api\/notifications\/([a-f0-9-]{36})\/read$/.exec(path);
      if(notificationRead&&method==='PATCH'){const user=requireUser(req);const result=db.prepare(`UPDATE notifications SET read_at=? WHERE id=? AND user_id=?`).run(now(),notificationRead[1],user.id);if(!result.changes)fail('Notification not found.',404);return reply(res,200,{ok:true});}
      if(path==='/api/notifications/read-all'&&method==='PATCH'){const user=requireUser(req);db.prepare(`UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL`).run(now(),user.id);return reply(res,200,{ok:true});}
      if(path==='/api/conversations'&&method==='GET'){
        const user=requireUser(req);const rows=db.prepare(`SELECT c.*,r.title report_title,ua.name name_a,ub.name name_b,
          (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>? AND NOT EXISTS (SELECT 1 FROM blocked_users b WHERE b.blocker_id=? AND b.blocked_id=m.sender_id)) unread
          FROM conversations c LEFT JOIN reports r ON r.id=c.report_id JOIN users ua ON ua.id=c.user_a JOIN users ub ON ub.id=c.user_b
          WHERE c.user_a=? OR c.user_b=? ORDER BY c.updated_at DESC`).all(user.id,user.id,user.id,user.id);
        return reply(res,200,{conversations:rows.map(r=>({id:r.id,reportId:r.report_id,reportTitle:r.report_title,otherName:r.user_a===user.id?r.name_b:r.name_a,unread:r.unread,updatedAt:r.updated_at}))});
      }
      if(path==='/api/conversations'&&method==='POST'){
        const user=requireUser(req),body=await jsonBody(req),otherId=typeof body.userId==='string'?body.userId:'';if(!otherId||otherId===user.id)fail('Choose a valid conversation participant.');
        if(!db.prepare('SELECT id FROM users WHERE id=?').get(otherId))fail('User not found.',404);
        if(db.prepare(`SELECT 1 FROM blocked_users WHERE (blocker_id=? AND blocked_id=? ) OR (blocker_id=? AND blocked_id=?)`).get(user.id,otherId,otherId,user.id))fail('Conversation unavailable because one user has blocked the other.',403);
        let reportId=null;if(typeof body.reportId==='string'&&body.reportId){if(!db.prepare('SELECT id FROM reports WHERE id=?').get(body.reportId))fail('Report not found.',404);reportId=body.reportId;}
        const a=user.id<otherId?user.id:otherId,b=user.id<otherId?otherId:user.id;
        let row=db.prepare(`SELECT * FROM conversations WHERE report_id=? AND user_a=? AND user_b=?`).get(reportId,a,b);
        if(!row){const id=randomUUID(),ts=now();db.prepare(`INSERT INTO conversations(id,report_id,user_a,user_b,created_at,updated_at) VALUES(?,?,?,?,?,?)`).run(id,reportId,a,b,ts,ts);row=db.prepare(`SELECT * FROM conversations WHERE id=?`).get(id);}
        return reply(res,201,{conversation:{id:row.id}});
      }
      const conversation=/^\/api\/conversations\/([a-f0-9-]{36})(?:\/(messages|block|report))?$/.exec(path);
      if(conversation){
        const [,conversationId,action]=conversation,user=requireUser(req);
        const row=db.prepare(`SELECT * FROM conversations WHERE id=? AND (user_a=? OR user_b=?)`).get(conversationId,user.id,user.id);if(!row)fail('Conversation not found.',404);
        if(action==='messages'&&method==='GET'){const rows=db.prepare(`SELECT m.*,u.name sender_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=? ORDER BY m.created_at ASC`).all(conversationId);return reply(res,200,{messages:rows.map(r=>({id:r.id,senderId:r.sender_id,senderName:r.sender_name,body:r.body,own:r.sender_id===user.id,createdAt:r.created_at}))});}
        if(action==='messages'&&method==='POST'){const body=await jsonBody(req),text=typeof body.body==='string'?body.body.trim():'';if(text.length<1||text.length>2000)fail('Message must be 1–2000 characters.');const other=row.user_a===user.id?row.user_b:row.user_a;if(db.prepare(`SELECT 1 FROM blocked_users WHERE blocker_id=? AND blocked_id=?`).get(other,user.id))fail('You cannot message this user.',403);const ts=now(),id=randomUUID();db.prepare(`INSERT INTO messages(id,conversation_id,sender_id,body,created_at) VALUES(?,?,?,?,?)`).run(id,conversationId,user.id,text,ts);db.prepare(`UPDATE conversations SET updated_at=? WHERE id=?`).run(ts,conversationId);notify(other,'message','New recovery message',text.slice(0,120),`/messages/${conversationId}`);return reply(res,201,{message:{id,body:text,createdAt:ts}});}
        if(action==='block'&&method==='POST'){const other=row.user_a===user.id?row.user_b:row.user_a;db.prepare(`INSERT OR IGNORE INTO blocked_users(blocker_id,blocked_id,created_at) VALUES(?,?,?)`).run(user.id,other,now());audit(user.id,'user.block','conversation',conversationId,'',req);return reply(res,200,{ok:true});}
        if(action==='report'&&method==='POST'){const body=await jsonBody(req);if(typeof body.reason!=='string'||body.reason.trim().length<10)fail('Reporting reason must be at least 10 characters.');audit(user.id,'conversation.report','conversation',conversationId,body.reason.trim().slice(0,500),req);return reply(res,201,{ok:true});}
      }
      if(path==='/api/saved'&&method==='GET'){
        const user=requireUser(req);const rows=db.prepare(`SELECT r.* FROM saved_reports s JOIN reports r ON r.id=s.report_id WHERE s.user_id=? AND r.moderation_status='visible' ORDER BY s.created_at DESC`).all(user.id);return reply(res,200,{reports:rows.map(publicReport)});
      }
      const savedReport=/^\/api\/saved\/([a-f0-9-]{36})$/.exec(path);
      if(savedReport&&(method==='POST'||method==='DELETE')){
        const user=requireUser(req),id=savedReport[1];if(!db.prepare('SELECT id FROM reports WHERE id=?').get(id))fail('Report not found.',404);
        if(method==='POST')db.prepare(`INSERT OR IGNORE INTO saved_reports(user_id,report_id,created_at) VALUES(?,?,?)`).run(user.id,id,now());
        else db.prepare(`DELETE FROM saved_reports WHERE user_id=? AND report_id=?`).run(user.id,id);
        audit(user.id,method==='POST'?'saved.add':'saved.remove','report',id,'',req);return reply(res,200,{ok:true});
      }
      if(path==='/api/searches'&&method==='GET'){const user=requireUser(req);const rows=db.prepare(`SELECT * FROM saved_searches WHERE user_id=? ORDER BY created_at DESC`).all(user.id);return reply(res,200,{searches:rows.map(r=>({id:r.id,name:r.name,query:JSON.parse(r.query),createdAt:r.created_at}))});}
      if(path==='/api/searches'&&method==='POST'){const user=requireUser(req),body=await jsonBody(req);const name=typeof body.name==='string'?body.name.trim().slice(0,60):'';if(name.length<2)fail('Search name must be 2–60 characters.');db.prepare(`INSERT INTO saved_searches(id,user_id,name,query,created_at) VALUES(?,?,?,?,?)`).run(randomUUID(),user.id,name,JSON.stringify(body.query||{}),now());return reply(res,201,{ok:true});}
      if(path==='/api/inventory'&&method==='GET'){const user=requireUser(req);const rows=db.prepare(`SELECT * FROM inventory WHERE user_id=? ORDER BY created_at DESC`).all(user.id);return reply(res,200,{inventory:rows.map(r=>({id:r.id,name:r.name,description:r.description,category:r.category,colour:r.colour,identifyingCode:r.identifying_code,createdAt:r.created_at}))});}
      if(path==='/api/inventory'&&method==='POST'){
        const user=requireUser(req),body=await jsonBody(req);const name=typeof body.name==='string'?body.name.trim():'';if(name.length<2||name.length>100)fail('Item name must be 2–100 characters.');const category=typeof body.category==='string'?body.category.trim().slice(0,60):'Other';const ts=now();
        db.prepare(`INSERT INTO inventory(id,user_id,name,description,category,colour,identifying_code,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(randomUUID(),user.id,name,typeof body.description==='string'?body.description.trim().slice(0,500):'',category,typeof body.colour==='string'?body.colour.trim().slice(0,60):'',typeof body.identifyingCode==='string'?body.identifyingCode.trim().slice(0,100):'',ts,ts);audit(user.id,'inventory.add','inventory','',name,req);return reply(res,201,{ok:true});
      }
      if(path==='/api/map'&&method==='GET'){
        const rows=db.prepare(`SELECT id,title,type,category,status,location,campus_zone,latitude,longitude,incident_date,created_at FROM reports WHERE moderation_status='visible' AND status='open'`).all();
        const groups=new Map();for(const r of rows){const key=r.location||r.campus_zone||'Other';groups.set(key,(groups.get(key)||0)+1);}
        return reply(res,200,{reports:rows.map(r=>({id:r.id,title:r.title,type:r.type,category:r.category,status:r.status,location:r.location,campusZone:r.campus_zone,latitude:r.latitude,longitude:r.longitude,incidentDate:r.incident_date})),heatmap:[...groups].map(([location,count])=>({location,count}))});
      }
      if(path==='/api/assistant'&&method==='POST'){
        const body=await jsonBody(req),q=typeof body.message==='string'?body.message.toLowerCase().trim():'';if(!q||q.length>500)fail('Message must be 1–500 characters.');
        let answer='',assistantReports=[];
        const helpIntent=/(how.*(create|post|report)|create.*(report|item)|post.*(report|item)|how.*claim|claim.*process|handover|safe.*recover)/.test(q);
        const reportQuery=!helpIntent&&/(lost|found|missing|item|items|report|reports|notebook|notebooks|bag|bottle|key|keys|kt|nb|earbuds|book|books|laptop|phone|charger|wallet|umbrella|clothes|hoodie|sunglasses|watch|keyboard|card|id)/.test(q);
        if(reportQuery){
          let type=null;
          const bothTypes=/\b(lost)\b/.test(q)&&/\b(found)\b/.test(q);
          if(!bothTypes&&/\b(found|find)\b/.test(q))type='found';
          else if(!bothTypes&&/\blost|missing\b/.test(q))type='lost';
          const stopWords=new Set(['show','me','the','all','about','details','detail','with','from','please','for','my','any','item','items','report','reports','lost','found','missing','database','in','on','at','of','and','or','a','an','list']);
          let searchTerms=q.match(/[a-z0-9]+/g)?.filter(word=>word.length>1&&!stopWords.has(word))||[];
          searchTerms=searchTerms.flatMap(word=>word==='kt'?['key','keys']:word==='nb'?['notebook','notebooks']:word==='id'?['id','identity','card']:word==='phone'?['phone','mobile','charger']:[word]);
          searchTerms=[...new Set(searchTerms)];
          let sql=`SELECT id,item_number,title,description,type,category,colour,location,incident_date,status,expires_at,created_at FROM reports WHERE moderation_status='visible'`;
          const args=[];
          if(type){sql+=' AND type=?';args.push(type);}
          if(!/\b(all|everything)\b/.test(q)&&searchTerms.length){
            const termSql=searchTerms.map(()=>`(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(keywords) LIKE ? OR LOWER(category) LIKE ? OR LOWER(colour) LIKE ? OR LOWER(location) LIKE ?)`).join(' OR ');
            sql+=` AND (${termSql})`;
            for(const term of searchTerms){const value=`%${term}%`;args.push(value,value,value,value,value,value);}
          }
          sql+=' ORDER BY created_at DESC LIMIT 25';
          let rows=db.prepare(sql).all(...args);
          if(rows.length===0&&searchTerms.length){
            const broadTerms=searchTerms.filter(word=>word.length>=3).slice(0,3);
            if(broadTerms.length){
              const fallback=broadTerms.map(()=>`(LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(keywords) LIKE ? OR LOWER(category) LIKE ?)`).join(' OR ');
              sql=`SELECT id,item_number,title,description,type,category,colour,location,incident_date,status,expires_at,created_at FROM reports WHERE moderation_status='visible' ${type?'AND type=?':''} AND (${fallback}) ORDER BY created_at DESC LIMIT 25`;
              const fallbackArgs=[];if(type)fallbackArgs.push(type);
              for(const term of broadTerms){const value=`%${term}%`;fallbackArgs.push(value,value,value,value);}
              rows=db.prepare(sql).all(...fallbackArgs);
            }
          }
          if(rows.length){
            assistantReports=rows.map(r=>({id:r.id,itemNumber:r.item_number||r.id.slice(0,8).toUpperCase(),title:r.title,type:r.type,category:r.category,colour:r.colour,location:r.location,incidentDate:r.incident_date,status:r.status,description:r.description||''}));
            answer=`I found ${rows.length} matching ${rows.length===1?'report':'reports'}:`;
          }else{
            answer=`No public reports matched “${body.message.trim().slice(0,120)}”. Try an item name such as “notebook”, “lost keys”, “found ID card”, or ask to “show all lost reports”.`;
          }
        }
        else
        if(/match|lost|found/.test(q)&&/(match|suggest|possible)/.test(q)){const sample=db.prepare(`SELECT title,type,location,category FROM reports WHERE moderation_status='visible' AND status='open' ORDER BY created_at DESC LIMIT 5`).all();answer=`I found ${sample.length} active reports to review. Potential matches are estimated, not verified; review category, colour, location and identifying details before claiming.`;}
        else if(/report|post|create/.test(q)){answer='To create a report, sign in, choose “Post report”, select lost or found, and include the item name, category, colour, campus location and date. Avoid passwords or full ID numbers.';}
        else if(/claim|handover|recover|collect/.test(q)){answer='Use the private claim form on a found-item listing. The owner can request an explanation and move the claim through pending, under review, approved or recovered. Complete handovers only through designated campus collection points.';}
        else if(/faq|password|privacy|safe/.test(q)){answer='CampusFind never verifies ownership from a matching score alone. Do not share private contact details or sensitive documents. Use campus staff or an approved collection point for identity checks.';}
        else {answer='I can help you search reports, create a lost or found report, understand private claims and locate safe handover guidance. I use the CampusFind database and do not create external university facts.';}
        return reply(res,200,{answer,reports:assistantReports,source:'CampusFind database assistant',verified:false});
      }
      const reportTimeline=/^\/api\/reports\/([a-f0-9-]{36})\/(timeline|renew)$/.exec(path);
      if(reportTimeline){
        const [,id,action]=reportTimeline,user=requireUser(req),report=ownReport(id,user);
        if(action==='timeline'&&method==='GET'){const rows=db.prepare(`SELECT e.*,u.name actor_name FROM report_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.report_id=? ORDER BY e.created_at ASC`).all(id);return reply(res,200,{events:rows.map(r=>({id:r.id,type:r.type,detail:r.detail,actorName:r.actor_name||'CampusFind',createdAt:r.created_at}))});}
        if(action==='renew'&&method==='PATCH'){const expiresAt=new Date(Date.now()+45*86400000).toISOString();db.prepare(`UPDATE reports SET expires_at=?,renewed_at=?,updated_at=? WHERE id=?`).run(expiresAt,now(),now(),id);db.prepare(`INSERT INTO report_events(id,report_id,actor_id,type,detail,created_at) VALUES(?,?,?,?,?,?)`).run(randomUUID(),id,user.id,'renewed','Listing renewed for 45 days',now());audit(user.id,'report.renew','report',id,'Renewed for 45 days',req);return reply(res,200,{expiresAt});}
      }
      if(path==='/api/admin/analytics'&&method==='GET'){
        requireAdmin(req);
        const category=db.prepare(`SELECT category,COUNT(*) count FROM reports GROUP BY category ORDER BY count DESC`).all().map(r=>({name:r.category,count:r.count}));
        const location=db.prepare(`SELECT location,COUNT(*) count FROM reports GROUP BY location ORDER BY count DESC`).all().map(r=>({name:r.location,count:r.count}));
        const status=db.prepare(`SELECT status,COUNT(*) count FROM reports GROUP BY status`).all().map(r=>({name:r.status,count:r.count}));
        const users=db.prepare(`SELECT COUNT(*) count FROM users`).get().count,reports=db.prepare(`SELECT COUNT(*) count FROM reports`).get().count,claims=db.prepare(`SELECT COUNT(*) count FROM claims`).get().count,flags=db.prepare(`SELECT COUNT(*) count FROM flags WHERE status='pending'`).get().count;
        return reply(res,200,{stats:{users,reports,claims,flags},category,location,status,audit:db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50`).all().map(r=>({id:r.id,action:r.action,entityType:r.entity_type,entityId:r.entity_id,detail:r.detail,createdAt:r.created_at}))});
      }
      if(path==='/api/admin/users'&&method==='GET'){
        requireAdmin(req);const rows=db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM reports r WHERE r.owner_id=u.id) report_count FROM users u ORDER BY u.created_at DESC`).all();return reply(res,200,{users:rows.map(r=>({uid:r.id,displayName:r.name,email:r.email,role:r.role,reportCount:r.report_count,createdAt:r.created_at}))});
      }
      const adminUser=/^\/api\/admin\/users\/([a-f0-9-]{36})$/.exec(path);
      if(adminUser&&method==='PATCH'){const actor=requireAdmin(req),body=await jsonBody(req);if(!['member','admin'].includes(body.role))fail('Role must be member or admin.');if(adminUser[1]===actor.id&&body.role==='member')fail('You cannot remove your own administrator role.');const result=db.prepare(`UPDATE users SET role=? WHERE id=?`).run(body.role,adminUser[1]);if(!result.changes)fail('User not found.',404);audit(actor.id,'user.role','user',adminUser[1],`Role changed to ${body.role}`,req);return reply(res,200,{ok:true});}
      if(path==='/api/admin/export.csv'&&method==='GET'){
        requireAdmin(req);const rows=db.prepare(`SELECT r.*,u.email owner_email FROM reports r JOIN users u ON u.id=r.owner_id ORDER BY r.created_at DESC`).all();
        const escape=v=>`"${String(v??'').replaceAll('"','""')}"`;
        const csv=['id,item_number,title,type,category,colour,location,status,incident_date,owner_email,created_at'].join(',')+'\n'+rows.map(r=>[r.id,r.item_number,r.title,r.type,r.category,r.colour,r.location,r.status,r.incident_date,r.owner_email,r.created_at].map(escape).join(',')).join('\n');
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="campusfind-reports.csv"','Cache-Control':'no-store'});return res.end(csv);
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
