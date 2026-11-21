import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('artifacts', { recursive: true });
const browser=await chromium.launch({ headless: true });
const results=[];
for(const route of ['/', '/browse', '/login', '/register']){
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5173'+route,{waitUntil:'networkidle'});
  const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+4);
  await page.keyboard.press('Tab');
  const keyboardFocus=await page.evaluate(()=>!!document.activeElement&&document.activeElement!==document.body);
  const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
  const name=route==='/'?'home':route.substring(1);
  await page.screenshot({path:'artifacts/mobile-'+name+'.png',fullPage:true});
  const violations=audit.violations.map(x=>({id:x.id,impact:x.impact,description:x.description,selectors:x.nodes.slice(0,3).map(n=>n.target.join(' '))}));
  results.push({route,horizontalOverflow,keyboardFocus,violations});
  console.log(JSON.stringify(results.at(-1)));
  await page.close();
}
await browser.close();
writeFileSync('artifacts/mobile-accessibility-audit.json',JSON.stringify(results,null,2));
if(results.some(x=>x.horizontalOverflow||!x.keyboardFocus||x.violations.length))process.exitCode=1;
