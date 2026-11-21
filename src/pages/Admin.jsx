import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Alert, Spinner } from '../components/UI';
import { api, humanError } from '../lib/data';
function HandoverPanel(){
  const [reportId,setReportId]=useState(''),[claimId,setClaimId]=useState('');
  const [identityConfirmed,setIdentityConfirmed]=useState(false),[descriptionConfirmed,setDescriptionConfirmed]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function submit(e){
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const result=await api('/admin/handovers',{method:'POST',body:{reportId:reportId.trim(),claimId:claimId.trim(),identityConfirmed,descriptionConfirmed}});
      setMessage('Recorded staff sign-off '+result.signoff.id+'.');
      setIdentityConfirmed(false);setDescriptionConfirmed(false);
    }catch(error){setMessage(humanError(error));}finally{setBusy(false);}
  }
  return <section className="panel mb-6 p-5" aria-label="Staff handover verification">
    <h2 className="mb-2 text-lg font-bold">Private handover checklist</h2>
    <p className="mb-3 text-sm text-slate-600">A designated campus staff member must check the claimant’s identity and item description in person before checking these boxes. An online claim is not proof of ownership.</p>
    <form className="space-y-3" onSubmit={submit}>
      <label className="block text-sm font-medium">Report ID<input className="mt-1 w-full rounded-lg border border-slate-300 p-2" required value={reportId} onChange={e=>setReportId(e.target.value)}/></label>
      <label className="block text-sm font-medium">Accepted claim ID<input className="mt-1 w-full rounded-lg border border-slate-300 p-2" required value={claimId} onChange={e=>setClaimId(e.target.value)}/></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={identityConfirmed} onChange={e=>setIdentityConfirmed(e.target.checked)}/>I personally verified the claimant’s identity with campus staff procedures.</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={descriptionConfirmed} onChange={e=>setDescriptionConfirmed(e.target.checked)}/>I privately checked the claimant’s item description before handover.</label>
      <button className="btn-primary" type="submit" disabled={busy||!identityConfirmed||!descriptionConfirmed}>Record staff sign-off</button>
      {message&&<p role="status" className="text-sm text-slate-700">{message}</p>}
    </form>
  </section>;
}
export default function Admin(){
  const {user}=useAuth(),[flags,setFlags]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState('');
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  async function load(){try{setFlags((await api('/admin/flags')).flags);setError('');}catch(e){setError(humanError(e));}finally{setLoading(false);}}
  useEffect(()=>{if(user?.role==='admin')load();else setLoading(false);},[user?.role]);
  async function update(endpoint,body,key){setBusy(key);try{await api(endpoint,{method:'PATCH',body});await load();}catch(e){setError(humanError(e));}finally{setBusy('');}}
  if(user?.role!=='admin')return <Alert>Only campus administrators can open moderation tools.</Alert>;
  return <div className="mx-auto max-w-4xl"><HandoverPanel/><section className="panel mb-6 p-5" aria-label="Privacy-safe monthly summary export"><h2 className="mb-2 text-lg font-bold">Monthly activity summary</h2><p className="mb-3 text-sm text-slate-600">Download aggregate report totals only. No names, emails, notes or student identifiers are included.</p><div className="flex flex-wrap items-end gap-3"><label className="text-sm font-medium">Report month <input className="mt-1 block rounded-lg border border-slate-300 p-2" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><a className="btn-primary" href={`/api/admin/summary.csv?month=${encodeURIComponent(month)}`} download>Export monthly CSV</a></div></section><div className="mb-7 flex items-center gap-3"><ShieldAlert className="text-brand" size={27}/><div><h1 className="text-3xl font-extrabold">Moderation queue</h1><p className="text-sm text-slate-500">Review flagged reports before changing visibility. Actions are limited to administrator accounts.</p></div></div>{error&&<Alert>{error}</Alert>}{loading?<Spinner/>:!flags.length?<p className="panel p-6 text-slate-500">No flagged reports.</p>:<div className="space-y-4">{flags.map(f=><article className="panel p-6" key={f.id}><div className="flex flex-wrap items-center justify-between gap-2"><Link className="font-bold text-brand" to={`/items/${f.reportId}`}>{f.reportTitle}</Link><span className="text-xs text-slate-500">{f.status}</span></div><p className="my-4 whitespace-pre-wrap text-sm text-slate-700">{f.reason}</p><div className="flex flex-wrap gap-2"><button className="btn-outline" disabled={busy===f.id} onClick={()=>update(`/admin/reports/${f.reportId}/moderation`,{status:'hidden'},f.id)}>Hide listing</button><button className="btn-outline" disabled={busy===f.id} onClick={()=>update(`/admin/reports/${f.reportId}/moderation`,{status:'visible'},f.id)}>Restore listing</button><button className="btn-primary" disabled={busy===f.id} onClick={()=>update(`/admin/flags/${f.id}`,{status:'reviewed'},f.id)}>Mark reviewed</button><button className="btn-outline" disabled={busy===f.id} onClick={()=>update(`/admin/flags/${f.id}`,{status:'dismissed'},f.id)}>Dismiss flag</button></div></article>)}</div>}</div>;
}
