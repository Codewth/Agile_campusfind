import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Plus, Heart, Grid2X2, Rows3, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import ReportCard from '../components/ReportCard';
import { Empty, Spinner, Alert } from '../components/UI';
import { categories, locations, getSaved, saveReportItem, unsaveReportItem } from '../lib/data';

export default function Browse({reports,loading,error}){
  const [search,setSearch]=useState('');
  const [type,setType]=useState('all');
  const [category,setCategory]=useState('all');
  const [location,setLocation]=useState('all');
  const [sort,setSort]=useState('newest');
  const [view,setView]=useState('grid');
  const [savedOnly,setSavedOnly]=useState(false);
  const [saved,setSaved]=useState([]);

  useEffect(()=>{getSaved().then(r=>setSaved(r.reports.map(x=>x.id))).catch(()=>{});},[]);

  async function toggleSaved(id){
    const isSaved=saved.includes(id);
    try{
      if(isSaved)await unsaveReportItem(id);else await saveReportItem(id);
      setSaved(current=>isSaved?current.filter(x=>x!==id):[...current,id]);
    }catch(e){
      window.dispatchEvent(new CustomEvent('campusfind:toast',{detail:e.message||'Please sign in to save reports.'}));
    }
  }

  const results=useMemo(()=>{
    const q=search.toLowerCase().trim();
    const filtered=reports.filter(x=>
      (!q||[x.title,x.description,x.keywords,x.category,x.colour].join(' ').toLowerCase().includes(q))&&
      (type==='all'||x.type===type)&&
      (category==='all'||x.category===category)&&
      (location==='all'||x.location.toLowerCase().includes(location.toLowerCase()))&&
      (!savedOnly||saved.includes(x.id))
    );
    return [...filtered].sort((a,b)=>{
      if(sort==='title')return a.title.localeCompare(b.title);
      if(sort==='oldest')return new Date(a.incidentDate)-new Date(b.incidentDate);
      return new Date(b.incidentDate)-new Date(a.incidentDate);
    });
  },[reports,search,type,category,location,sort,savedOnly,saved]);
  const hasFilters=search||type!=='all'||category!=='all'||location!=='all'||savedOnly;

  return <>
    <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand">Lost & found directory</p>
        <h1 className="mt-2 text-3xl font-extrabold md:text-4xl">Explore campus reports</h1>
        <p className="mt-2 text-slate-700">Search for a familiar clue, or explore what others have reported.</p>
      </div>
      <Link className="btn-primary" to="/report/new"><Plus size={17}/>Post report</Link>
    </div>
    <section className="panel mb-8 p-5">
      <label htmlFor="query" className="field-label">Search reports</label>
      <div className="relative">
        <Search size={19} className="absolute left-4 top-3.5 text-slate-400"/>
        <input id="query" className="input pl-12 pr-12" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Try 'blue backpack', 'earbuds' or 'ID card'…"/>
        {search&&<button type="button" aria-label="Clear search" onClick={()=>setSearch('')} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={17}/></button>}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <div><label className="field-label" htmlFor="type">Report type</label><select id="type" className="input" value={type} onChange={e=>setType(e.target.value)}><option value="all">All reports</option><option value="lost">Lost</option><option value="found">Found</option></select></div>
        <div><label className="field-label" htmlFor="category">Category</label><select id="category" className="input" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(x=><option key={x}>{x}</option>)}</select></div>
        <div><label className="field-label" htmlFor="location">Location</label><select id="location" className="input" value={location} onChange={e=>setLocation(e.target.value)}><option value="all">All locations</option>{locations.map(x=><option key={x}>{x}</option>)}</select></div>
      </div>
    </section>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-slate-700"><SlidersHorizontal size={17}/>{loading?'Loading…':`${results.length} ${results.length===1?'report':'reports'} found`}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={()=>setSavedOnly(v=>!v)} className={`btn py-2 ${savedOnly?'border border-red-100 bg-red-50 text-red-600':'btn-outline'}`}><Heart size={16} fill={savedOnly?'currentColor':'none'}/>Saved{saved.length?` (${saved.length})`:''}</button>
        <label htmlFor="sort" className="sr-only">Sort reports</label>
        <select id="sort" className="input w-auto py-2" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option></select>
        <div className="hidden items-center rounded-xl border border-slate-200 bg-white p-1 sm:flex">
          <button type="button" aria-label="Grid view" onClick={()=>setView('grid')} className={`rounded-lg p-2 ${view==='grid'?'bg-brand-pale text-brand':'text-slate-500'}`}><Grid2X2 size={16}/></button>
          <button type="button" aria-label="List view" onClick={()=>setView('list')} className={`rounded-lg p-2 ${view==='list'?'bg-brand-pale text-brand':'text-slate-500'}`}><Rows3 size={16}/></button>
        </div>
        {hasFilters&&<button type="button" onClick={()=>{setSearch('');setType('all');setCategory('all');setLocation('all');setSavedOnly(false);}} className="btn-outline py-2"><X size={16}/>Clear</button>}
      </div>
    </div>
    {error&&<Alert>{error}</Alert>}
    {loading?<Spinner/>:results.length
      ?<div className={view==='list'?'grid max-w-4xl gap-4':'grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}>{results.map(x=><ReportCard key={x.id} report={x} saved={saved.includes(x.id)} onToggleSaved={toggleSaved}/>)}</div>
      :<Empty title={savedOnly?'No saved reports yet':'No matching reports'} description={savedOnly?'Save reports with the heart button and they will appear here.':'Try adjusting filters, or create a report to help others find an item.'} action/>}
  </>;
}
