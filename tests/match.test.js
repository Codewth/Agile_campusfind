import { describe, expect, it } from 'vitest';
import { scoreMatch, findMatches } from '../src/lib/match';
const lost={id:'1',type:'lost',status:'open',title:'Black earbuds',category:'Electronics',colour:'Black',location:'Library',incidentDate:'2026-10-10',description:'Charging case',keywords:'wireless'};
const found={...lost,id:'2',type:'found'};
describe('smart match',()=>{
 it('scores opposite type and explains reasons',()=>{const x=scoreMatch(lost,found);expect(x.score).toBe(100);expect(x.reasons.length).toBeGreaterThan(0);});
 it('never compares same-type or resolved items',()=>{expect(scoreMatch(lost,{...found,type:'lost'})).toBeNull();expect(scoreMatch(lost,{...found,status:'resolved'})).toBeNull();});
 it('sorts relevant matches first',()=>{const weaker={...found,id:'3',category:'Keys',colour:'red',location:'Hostel',incidentDate:'2026-01-01',title:'silver keys',description:'',keywords:''};const m=findMatches(lost,[weaker,found]);expect(m[0].item.id).toBe('2');});
 it('does not match self',()=>expect(scoreMatch(lost,lost)).toBeNull());
});