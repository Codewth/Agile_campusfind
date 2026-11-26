export const categories = ['Electronics','ID cards','Keys','Books & notes','Bags','Accessories','Clothing','Water bottles','Other'];
export const statuses = ['open','claimed','resolved'];
export const types = ['lost','found'];
export function fail(message, status=400) { const e=new Error(message); e.status=status; throw e; }
function clean(value, label, min, max, required=true) {
  if (typeof value !== 'string') fail(`${label} must be text.`);
  const result=value.trim();
  if((required&&result.length<min)||result.length>max) fail(`${label} must be ${min}–${max} characters.`);
  return result;
}
export function reportInput(raw) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('A report object is required.');
  const title=clean(raw.title,'Title',3,100);
  const description=clean(raw.description??'','Description',0,1000,false);
  const colour=clean(raw.colour,'Colour',1,60);
  const location=clean(raw.location,'Location',1,120);
  const keywords=clean(raw.keywords??'','Keywords',0,500,false);
  const category=clean(raw.category,'Category',1,60);
  if(!categories.includes(category))fail('Choose a valid category.');
  if(!types.includes(raw.type))fail('Report type must be lost or found.');
  const incidentDate=clean(raw.incidentDate,'Date',10,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(incidentDate)||Number.isNaN(Date.parse(incidentDate))||new Date(incidentDate).toISOString().slice(0,10)!==incidentDate)fail('Enter a valid date.');
  if(incidentDate>new Date().toISOString().slice(0,10))fail('Report date cannot be in the future.');
  const campusZone=typeof raw.campusZone==='string'?clean(raw.campusZone,'Campus zone',0,120,false):'';
  const latitude=raw.latitude===null||raw.latitude===undefined||raw.latitude===''?null:Number(raw.latitude);
  const longitude=raw.longitude===null||raw.longitude===undefined||raw.longitude===''?null:Number(raw.longitude);
  if(latitude!==null&&!Number.isFinite(latitude))fail('Latitude must be a valid number.');
  if(longitude!==null&&!Number.isFinite(longitude))fail('Longitude must be a valid number.');
  if(latitude!==null&&(latitude<-90||latitude>90))fail('Latitude is outside the valid range.');
  if(longitude!==null&&(longitude<-180||longitude>180))fail('Longitude is outside the valid range.');
  return {title,description,colour,location,keywords,category,type:raw.type,incidentDate,campusZone,latitude,longitude};
}
export function validateCredentials(body, registration=false){
  if(!body||typeof body!=='object') fail('Account details are required.');
  const email=clean(body.email,'Email',5,254).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid email address.');
  if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)fail('Password must be 8–128 characters.');
  const name=registration?clean(body.name,'Name',2,60):null;
  return {email,password:body.password,name};
}
export function profileInput(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Profile details are required.');
  const name=clean(raw.name,'Name',2,60);
  const aboutMe=clean(raw.aboutMe??'','About me',0,500,false);
  const department=clean(raw.department??'','Department or programme',0,100,false);
  const yearOfStudy=clean(raw.yearOfStudy??'','Year of study',0,20,false);
  if(!['','1','2','3','4','postgraduate','other'].includes(yearOfStudy))fail('Choose a valid year of study.');
  return {name,aboutMe,department,yearOfStudy};
}
export function validateImage(data){
  if(data==null||data==='')return null;
  if(typeof data!=='string')fail('Image must be an encoded JPG, PNG, or WebP.');
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match)fail('Image must be a JPG, PNG or WebP.');
  if(match[2].length>7_000_000)fail('Image must be smaller than 5 MB.');
  const bytes=Buffer.from(match[2],'base64');
  if(bytes.length===0||bytes.length>=5*1024*1024)fail('Image must be smaller than 5 MB.');
  const type=match[1];
  const valid=type==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
    type==='jpeg'?bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
    bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid)fail('Image content does not match its file type.');
  return {bytes,ext:type==='jpeg'?'jpg':type,mime:`image/${type}`};
}
