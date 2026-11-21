import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Alert, Spinner } from '../components/UI';
import { api, humanError } from '../lib/data';
export default function Admin(){
  const {user}=useAuth(),[flags,setFlags]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('');
  async function load(){try{setFlags((await api('/admin/flags')).flags);setError('');}catch(e){setError(humanError(e));}finally{setLoading(false);}}
  useEffect(()=>{if(user?.role==='admin')load();else setLoading(false);},[user?.role]);
  async function update(endpoint,body,key){setBusy(key);try{await api(endpoint,{method:'PATCH',body});await load();}catch(e){setError(humanError(e));}finally{setBusy('');}}
  if(user?.role!=='admin')return <Alert>Only campus administrators can open moderation tools.</Alert>;
  return <div className="mx-auto max-w-4xl"><div className="mb-7 flex items-center gap-3"><ShieldAlert className="text-brand" size={27}/><div><h1 className="text-3xl font-extrabold">Moderation queue</h1><p className="text-sm text-slate-500">Review flagged reports before changing visibility. Actions are limited to administrator accounts.</p></div></div>{error&&<Alert>{error}</Alert>}{loading?<Spinner/>:!flags.length?<p className="panel p-6 text-slate-500">No flagged reports.</p>:<div className="space-y-4">{flags.map(f=><article className="panel p-6" key={f.id}><div className="flex flex-wrap items-center justify-between gap-2"><Link className="font-bold text-brand" to={`/items/${f.reportId}`}>{f.reportTitle}</Link><span className="text-xs text-slate-500">{f.status}</span></div><p className="my-4 whitespace-pre-wrap text-sm text-slate-700">{f.reason}</p><div className="flex flex-wrap gap-2"><button className="btn-outline" disabled={busy===f.id} onClick={()=>update(`/admin/reports/${f.reportId}/moderation`,{status:'hidden'},f.id)}>Hide listing</button><button className="btn-outline" disabled={busy===f.id} onClick={()=>update(`/admin/reports/${f.reportId}/moderation`,{status:'visible'},f.id)}>Restore listing</button><button className="btn-primary" disabled={busy===f.id} onClick={()=>update(`/admin/flags/${f.id}`,{status:'reviewed'},f.id)}>Mark reviewed</button><button className="btn-outline" disabled={busy===f.id} onClick={()=>update(`/admin/flags/${f.id}`,{status:'dismissed'},f.id)}>Dismiss flag</button></div></article>)}</div>}</div>;
}
