import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, ShieldAlert, Users, PackageCheck, MessageSquareWarning } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Alert, Spinner } from '../components/UI';
import { api, humanError } from '../lib/data';

function HandoverPanel(){
  const [reportId,setReportId]=useState('');
  const [claimId,setClaimId]=useState('');
  const [identityConfirmed,setIdentityConfirmed]=useState(false);
  const [descriptionConfirmed,setDescriptionConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');

  async function submit(e){
    e.preventDefault();setBusy(true);setMessage('');
    try{
      const result=await api('/admin/handovers',{method:'POST',body:{reportId:reportId.trim(),claimId:claimId.trim(),identityConfirmed,descriptionConfirmed}});
      setMessage(`Recorded staff sign-off ${result.signoff.id}.`);
      setIdentityConfirmed(false);setDescriptionConfirmed(false);
    }catch(error){setMessage(humanError(error));}
    finally{setBusy(false);}
  }

  return <section className="panel mb-6 p-5" aria-label="Staff handover verification">
    <h2 className="mb-2 text-lg font-bold">Private handover checklist</h2>
    <p className="mb-3 text-sm text-slate-700">Designated campus staff must verify identity and item details in person before signing off. An online claim is not proof of ownership.</p>
    <form className="space-y-3" onSubmit={submit}>
      <label className="block text-sm font-medium">Report ID<input className="mt-1 w-full rounded-lg border border-slate-300 p-2" required value={reportId} onChange={e=>setReportId(e.target.value)}/></label>
      <label className="block text-sm font-medium">Approved claim ID<input className="mt-1 w-full rounded-lg border border-slate-300 p-2" required value={claimId} onChange={e=>setClaimId(e.target.value)}/></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={identityConfirmed} onChange={e=>setIdentityConfirmed(e.target.checked)}/>I verified the claimant’s identity in person.</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={descriptionConfirmed} onChange={e=>setDescriptionConfirmed(e.target.checked)}/>I checked the claimant’s private item description.</label>
      <button className="btn-primary" type="submit" disabled={busy||!identityConfirmed||!descriptionConfirmed}>Record staff sign-off</button>
      {message&&<p role="status" className="text-sm text-slate-700">{message}</p>}
    </form>
  </section>;
}

export default function Admin(){
  const {user}=useAuth();
  const [flags,setFlags]=useState([]);
  const [analytics,setAnalytics]=useState(null);
  const [users,setUsers]=useState([]);
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');

  async function load(){
    try{
      const [flagData,analyticsData,userData]=await Promise.all([api('/admin/flags'),api('/admin/analytics'),api('/admin/users')]);
      setFlags(flagData.flags);setAnalytics(analyticsData);setUsers(userData.users);setError('');
    }catch(e){setError(humanError(e));}
    finally{setLoading(false);}
  }
  useEffect(()=>{if(user?.role==='admin')load();else setLoading(false);},[user?.role]);

  async function update(endpoint,body,key){
    setBusy(key);
    try{await api(endpoint,{method:'PATCH',body});await load();}
    catch(e){setError(humanError(e));}
    finally{setBusy('');}
  }

  if(user?.role!=='admin')return <Alert>Only campus administrators can open moderation tools.</Alert>;

  return <div className="mx-auto max-w-6xl">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3"><ShieldAlert className="text-brand" size={27}/><div><h1 className="text-3xl font-extrabold">Admin portal</h1><p className="text-sm text-slate-600">Campus moderation, users and recovery analytics.</p></div></div>
      <a className="btn-outline" href="/api/admin/export.csv"><Download size={16}/>Export report CSV</a>
    </div>
    {error&&<Alert>{error}</Alert>}
    {loading?<Spinner/>:<>
      <HandoverPanel/>
      <section className="panel mb-7 p-5" aria-label="Privacy-safe monthly summary export">
        <h2 className="mb-2 text-lg font-bold">Monthly activity summary</h2>
        <p className="mb-3 text-sm text-slate-700">Aggregate report totals only. Names, emails, notes and student identifiers are excluded.</p>
        <div className="flex flex-wrap items-end gap-3"><label className="text-sm font-medium">Report month<input className="mt-1 block rounded-lg border border-slate-300 p-2" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><a className="btn-primary" href={`/api/admin/summary.csv?month=${encodeURIComponent(month)}`} download>Export monthly CSV</a></div>
      </section>
      {analytics&&<div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[[Users,'Users',analytics.stats.users],[PackageCheck,'Reports',analytics.stats.reports],[ShieldAlert,'Claims',analytics.stats.claims],[MessageSquareWarning,'Pending flags',analytics.stats.flags]].map(([Icon,label,value])=><div className="panel p-5" key={label}><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-600">{label}</p><Icon className="text-brand" size={18}/></div><p className="mt-3 text-3xl font-extrabold">{value}</p></div>)}</div>}
      <div className="mb-7 grid gap-6 lg:grid-cols-2">
        <section className="panel p-6"><h2 className="font-extrabold">Reports by location</h2><div className="mt-4 space-y-3">{analytics?.location.slice(0,8).map(x=><div key={x.name} className="flex justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"><span>{x.name}</span><b>{x.count}</b></div>)}</div></section>
        <section className="panel p-6"><h2 className="font-extrabold">Reports by category</h2><div className="mt-4 space-y-3">{analytics?.category.slice(0,8).map(x=><div key={x.name} className="flex justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"><span>{x.name}</span><b>{x.count}</b></div>)}</div></section>
      </div>
      <section className="panel mb-7 p-6">
        <h2 className="font-extrabold">User management</h2>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-3">User</th><th>Role</th><th>Reports</th><th>Action</th></tr></thead><tbody>{users.slice(0,30).map(u=><tr className="border-t" key={u.uid}><td className="py-3 pr-4"><p className="font-semibold">{u.displayName}</p><p className="text-xs text-slate-600">{u.email}</p></td><td>{u.role}</td><td>{u.reportCount}</td><td><select className="input w-32 py-2" value={u.role} disabled={u.uid===user.uid||busy===u.uid} onChange={e=>update(`/admin/users/${u.uid}`,{role:e.target.value},u.uid)}><option value="member">Member</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div>
      </section>
      <section><h2 className="mb-4 text-xl font-extrabold">Moderation queue</h2>{!flags.length?<p className="panel p-6 text-slate-600">No flagged reports.</p>:<div className="space-y-4">{flags.map(f=><article className="panel p-6" key={f.id}><div className="flex flex-wrap items-center justify-between gap-2"><Link className="font-bold text-brand" to={`/items/${f.reportId}`}>{f.reportTitle}</Link><span className="text-xs text-slate-600">{f.status}</span></div><p className="my-4 whitespace-pre-wrap text-sm text-slate-800">{f.reason}</p><div className="flex flex-wrap gap-2"><button className="btn-outline" disabled={busy===f.id} onClick={()=>update(`/admin/reports/${f.reportId}/moderation`,{status:'hidden'},f.id)}>Hide listing</button><button className="btn-outline" disabled={busy===f.id} onClick={()=>update(`/admin/reports/${f.reportId}/moderation`,{status:'visible'},f.id)}>Restore listing</button><button className="btn-primary" disabled={busy===f.id} onClick={()=>update(`/admin/flags/${f.id}`,{status:'reviewed'},f.id)}>Mark reviewed</button><button className="btn-outline" disabled={busy===f.id} onClick={()=>update(`/admin/flags/${f.id}`,{status:'dismissed'},f.id)}>Dismiss flag</button></div></article>)}</div>}</section>
    </>}
  </div>;
}
