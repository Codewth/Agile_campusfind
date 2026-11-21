const tokens=s=>new Set((s||'').toLowerCase().match(/[a-z0-9]+/g)?.filter(w=>w.length>2)||[]);
const norm=v=>(v||'').toString().trim().toLowerCase();
const daysBetween=(a,b)=>{if(!a||!b)return Infinity;const x=new Date(a+'T12:00:00Z'),y=new Date(b+'T12:00:00Z');return Math.abs(x-y)/86400000;};
/** A transparent suggestion score. Never treat a score as proof of ownership. */
export function scoreMatch(a,b){
  if(!a||!b||a.type===b.type||a.status!=='open'||b.status!=='open'||a.id===b.id)return null;
  let score=0;const reasons=[];
  if(norm(a.category)===norm(b.category)){score+=35;reasons.push('Same category (+35)');}
  if(norm(a.colour)&&norm(a.colour)===norm(b.colour)){score+=20;reasons.push('Same colour (+20)');}
  if(norm(a.location)&&norm(a.location)===norm(b.location)){score+=20;reasons.push('Same location (+20)');}
  const days=daysBetween(a.incidentDate,b.incidentDate);
  if(days<=2){score+=15;reasons.push('Dates within 2 days (+15)');}
  else if(days<=7){score+=8;reasons.push('Dates within a week (+8)');}
  const ta=tokens(`${a.title||''} ${a.description||''} ${a.keywords||''}`),tb=tokens(`${b.title||''} ${b.description||''} ${b.keywords||''}`);
  const overlap=[...ta].filter(t=>tb.has(t));
  if(overlap.length){const points=Math.min(10,overlap.length*5);score+=points;reasons.push(`Shared keywords: ${overlap.slice(0,4).join(', ')} (+${points})`);}
  return {score,reasons};
}
export function findMatches(item,reports,minimum=35){return reports.map(r=>({item:r,match:scoreMatch(item,r)})).filter(x=>x.match&&x.match.score>=minimum).sort((a,b)=>b.match.score-a.match.score);}
