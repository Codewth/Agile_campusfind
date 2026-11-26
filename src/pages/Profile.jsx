import { useEffect, useState } from 'react';
import { Save, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Alert, Skeleton } from '../components/UI';
import { api, humanError } from '../lib/data';

const blank={name:'',aboutMe:'',department:'',yearOfStudy:''};

export default function Profile(){
  const {user,updateProfile}=useAuth();
  const [form,setForm]=useState(blank);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  useEffect(()=>{
    let active=true;
    api('/profile').then(({profile})=>{
      if(active)setForm({name:profile.displayName||'',aboutMe:profile.aboutMe||'',department:profile.department||'',yearOfStudy:profile.yearOfStudy||''});
    }).catch(e=>{if(active)setError(humanError(e));}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[]);

  function change(field,value){setForm(current=>({...current,[field]:value}));setSuccess('');}
  async function submit(e){
    e.preventDefault();setError('');setSuccess('');setBusy(true);
    try{
      const profile=await updateProfile(form);
      setForm({name:profile.displayName,aboutMe:profile.aboutMe,department:profile.department,yearOfStudy:profile.yearOfStudy});
      setSuccess('Your profile has been saved.');
    }catch(e){setError(humanError(e));}
    finally{setBusy(false);}
  }

  return <div className="mx-auto max-w-3xl">
    <div className="mb-8">
      <p className="text-xs font-bold uppercase tracking-widest text-brand">Your account</p>
      <h1 className="mt-2 text-3xl font-extrabold">About me</h1>
      <p className="mt-2 text-slate-600">View and update the details saved to your CampusFind account.</p>
    </div>
    {error&&<div className="mb-5"><Alert>{error}</Alert></div>}
    {loading?<Skeleton className="h-[480px]"/>:<form onSubmit={submit} className="panel space-y-6 p-6 sm:p-9">
      <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-pale text-brand"><UserRound size={27}/></div>
        <div><h2 className="text-lg font-extrabold">{form.name||'Your profile'}</h2><p className="text-sm text-slate-600">Your profile details are private to your account.</p></div>
      </div>
      <div>
        <label htmlFor="profile-name" className="field-label">Name</label>
        <input id="profile-name" className="input" required minLength={2} maxLength={60} value={form.name} onChange={e=>change('name',e.target.value)} autoComplete="name"/>
      </div>
      <div>
        <label htmlFor="profile-email" className="field-label">Email</label>
        <input id="profile-email" className="input bg-slate-50 text-slate-600" value={user?.email||''} readOnly aria-describedby="email-note"/>
        <p id="email-note" className="mt-1 text-xs text-slate-600">Email is used to sign in and can’t be changed here.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-department" className="field-label">Department or programme</label>
          <input id="profile-department" className="input" maxLength={100} value={form.department} onChange={e=>change('department',e.target.value)} placeholder="e.g. Computer Science"/>
        </div>
        <div>
          <label htmlFor="profile-year" className="field-label">Year of study</label>
          <select id="profile-year" className="input" value={form.yearOfStudy} onChange={e=>change('yearOfStudy',e.target.value)}>
            <option value="">Select year (optional)</option>
            <option value="1">1st year</option>
            <option value="2">2nd year</option>
            <option value="3">3rd year</option>
            <option value="4">4th year</option>
            <option value="postgraduate">Postgraduate</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor="profile-about" className="field-label mb-0">About me</label>
          <span className="text-xs text-slate-500">{form.aboutMe.length}/500</span>
        </div>
        <textarea id="profile-about" className="input" rows={5} maxLength={500} value={form.aboutMe} onChange={e=>change('aboutMe',e.target.value)} placeholder="Share a little about yourself (optional). Avoid sensitive information."/>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <div aria-live="polite">{success&&<p className="text-sm font-semibold text-emerald-700">{success}</p>}</div>
        <button type="submit" className="btn-primary" disabled={busy}><Save size={16}/>{busy?'Saving…':'Save profile'}</button>
      </div>
    </form>}
  </div>;
}
