// CampusFind REST API. The server, never the browser, owns session/auth and persistence.
export const categories=['Electronics','ID cards','Keys','Books & notes','Bags','Accessories','Clothing','Water bottles','Other'];
export const locations=['Library','Main gate','Cafeteria','Classroom','Hostel','Sports ground','Laboratory','Auditorium','Other'];
export const humanError=e=>e?.message||'Something went wrong. Please try again.';
export async function api(path,{method='GET',body}={}){
  let response;
  try{response=await fetch(`/api${path}`,{method,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
  catch{throw new Error('Cannot reach CampusFind backend. Make sure npm run dev:server is running.');}
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||`Request failed (${response.status}).`);
  return result;
}
const refresh=()=>window.dispatchEvent(new Event('campusfind:refresh'));
export function subscribeReports(onChange,onError,{includeMine=false}={}){
  let cancelled=false;
  async function reload(){try{const [{reports},mine]=await Promise.all([api('/reports?limit=500'),includeMine?api('/reports?mine=1&limit=500'):Promise.resolve({reports:[]})]);const distinct=new Map([...reports,...mine.reports].map(r=>[r.id,r]));if(!cancelled)onChange([...distinct.values()]);}catch(e){if(!cancelled)onError(e);}}
  const onVisible=()=>{if(document.visibilityState==='visible')reload();};
  const onFocus=()=>reload();
  reload();const interval=setInterval(reload,12000);
  window.addEventListener('campusfind:refresh',onFocus);
  document.addEventListener('visibilitychange',onVisible);
  return ()=>{cancelled=true;clearInterval(interval);window.removeEventListener('campusfind:refresh',onFocus);document.removeEventListener('visibilitychange',onVisible);};
}
function readImage(file){return new Promise((resolve,reject)=>{
  if(!file)return resolve(null);
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>=5*1024*1024)return reject(new Error('Upload JPG, PNG or WebP under 5 MB.'));
  const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Cannot read the chosen image.'));reader.readAsDataURL(file);
});}
export async function saveReport(form,user,id){
  if(!user)throw new Error('Please sign in to save a report.');
  const {file,title,description,type,category,colour,location,campusZone,latitude,longitude,incidentDate,keywords}=form;
  const data={title,description,type,category,colour,location,campusZone,latitude:latitude||null,longitude:longitude||null,incidentDate,keywords};
  if(file)data.imageData=await readImage(file);
  await api(id?`/reports/${encodeURIComponent(id)}`:'/reports',{method:id?'PATCH':'POST',body:data});
  refresh();
}
export async function changeStatus(report,user,status){
  if(!user||report.ownerId!==user.uid)throw new Error('Only the report owner can change its status.');
  await api(`/reports/${report.id}/status`,{method:'PATCH',body:{status}});refresh();
}
export async function removeReport(report,user){
  if(!user||report.ownerId!==user.uid)throw new Error('Only the report owner can delete it.');
  await api(`/reports/${report.id}`,{method:'DELETE'});refresh();
}
export async function submitClaim(id,note){const result=await api(`/reports/${id}/claims`,{method:'POST',body:{note}});refresh();return result;}
export async function getClaims(scope='incoming'){return (await api(`/claims?scope=${scope}`)).claims;}
export async function decideClaim(id,status){const result=await api(`/claims/${id}`,{method:'PATCH',body:{status}});refresh();return result;}
export async function flagReport(id,reason){return api(`/reports/${id}/flag`,{method:'POST',body:{reason}});}
export const getDashboard=()=>api('/dashboard');
export const getNotifications=()=>api('/notifications');
export async function markNotification(id){return api(`/notifications/${id}/read`,{method:'PATCH'});}
export async function markAllNotifications(){return api('/notifications/read-all',{method:'PATCH'});}
export const getSaved=()=>api('/saved');
export const saveReportItem=id=>api(`/saved/${id}`,{method:'POST'});
export const unsaveReportItem=id=>api(`/saved/${id}`,{method:'DELETE'});
export const getSavedSearches=()=>api('/searches');
export const addSavedSearch=(name,query)=>api('/searches',{method:'POST',body:{name,query}});
export const getInventory=()=>api('/inventory');
export const addInventory=body=>api('/inventory',{method:'POST',body});
export const getMap=()=>api('/map');
export const getConversations=()=>api('/conversations');
export const createConversation=body=>api('/conversations',{method:'POST',body});
export const getMessages=id=>api(`/conversations/${id}/messages`);
export const sendMessage=(id,body)=>api(`/conversations/${id}/messages`,{method:'POST',body:{body}});
export const blockConversation=id=>api(`/conversations/${id}/block`,{method:'POST'});
export const reportConversation=(id,reason)=>api(`/conversations/${id}/report`,{method:'POST',body:{reason}});
export const askAssistant=message=>api('/assistant',{method:'POST',body:{message}});
