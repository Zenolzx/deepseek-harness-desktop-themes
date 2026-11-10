import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const runtime=createRequire(join(process.env.DTH_RUNTIME_NODE_MODULES || join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),'playwright/package.json'));
const {chromium}=runtime('playwright');
mkdirSync('tmp/creator',{recursive:true});
await build({entryPoints:['scripts/studio-preview.tsx'],outfile:'tmp/creator/app.js',bundle:true,format:'iife',loader:{'.css':'text','.png':'dataurl','.svg':'dataurl'},jsx:'automatic'});
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url?.startsWith('/app.js')?'text/javascript':'text/html');res.end(req.url?.startsWith('/app.js')?readFileSync('tmp/creator/app.js'):'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script src="/app.js"></script></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?theme=quantum-blue&ai=1&creator=1`);
  const input=page.getByLabel('设计要求',{exact:true}),generate=page.getByRole('button',{name:'生成预览',exact:true});
  await input.fill('需要追问');await generate.click();await page.getByText('补充这一点后继续；也可以回复“按推荐处理”。',{exact:true}).waitFor();
  assert.equal(await page.locator('.dth-ai-message').count(),2);
  await input.fill('按推荐处理，青绿轮廓');await generate.click();
  await page.waitForFunction(()=>document.querySelector('input[maxlength="64"]').value==='按推荐处理，青绿轮廓');
  assert.equal(await page.evaluate(()=>window.__studioSaves??0),0,'actual rendering cannot save automatically');
  const report=await page.evaluate(()=>window.__inspection);
  assert.equal(report.samples.length,4);assert.equal(report.roundTrip,true);assert.deepEqual(report.errors,[]);
  assert.deepEqual(report.samples.map(s=>[s.width,s.height,s.phase,s.state]),[[1280,800,0,'reading'],[1280,800,4,'menu'],[390,844,8,'document'],[390,844,0,'reduced-motion']]);
  for(const [i,s] of report.samples.entries()){assert.ok(s.image.startsWith('data:image/png;base64,'));assert.ok(s.frameMs>=0);writeFileSync(`tmp/creator/sample-${i}.png`,Buffer.from(s.image.split(',')[1],'base64'));}
  const pixels=await page.evaluate(async data=>{const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return [Array.from(ctx.getImageData(10,10,1,1).data),Array.from(ctx.getImageData(Math.round(c.width*.5),Math.round(c.height*.3),1,1).data)];},report.samples[0].image);
  assert.equal(pixels[0][3],255,'capture must contain the actual opaque artwork');assert.notDeepEqual(pixels[0],pixels[1],'capture must contain the actual reading surface');
  assert.equal(await page.locator('[style*="-20000px"]').count(),0,'capture nodes are always removed');
  assert.equal(await page.locator('.dth-artwork-showcase canvas').count(),1);
  await page.screenshot({path:'tmp/creator/desktop.png',fullPage:true});
  await page.getByRole('button',{name:'保存并应用',exact:true}).click();
  const saved=await page.evaluate(()=>window.__studioStore.get().customThemes.at(-1));assert.equal(saved.artwork.layers[0].shape,'path');
  await page.reload();await page.waitForFunction(()=>!!document.querySelector('.dth-artwork-showcase canvas'));
  assert.equal(await page.getByLabel('主题名称',{exact:true}).inputValue(),'按推荐处理，青绿轮廓');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
  assert.equal(await page.locator('.dth-artwork-showcase canvas').getAttribute('data-phase'),'0.00');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'tmp/creator/mobile.png',fullPage:true});
  const runtimeResult=await page.evaluate(async()=>{
    const tools=window.__artworkTools,runtime=new tools.ArtworkRuntime(),art=tools.artwork();
    const button=document.createElement('button');button.textContent='受保护操作';Object.assign(button.style,{position:'fixed',top:'10px',left:'10px',width:'100px',height:'50px'});document.body.append(button);
    runtime.update(art,true);await new Promise(r=>setTimeout(r,160));
    const canvas=document.querySelector('.dth-artwork-runtime'),ctx=canvas.getContext('2d');
    const protectedAlpha=ctx.getImageData(30,30,1,1).data[3];runtime.update(art,true);
    const count=document.querySelectorAll('.dth-artwork-runtime').length;runtime.dispose();button.remove();
    return {protectedAlpha,count,remaining:document.querySelectorAll('.dth-artwork-runtime').length};
  });
  assert.deepEqual(runtimeResult,{protectedAlpha:255,count:1,remaining:0},'the background must remain opaque without text-shaped holes; updates and disposal must not accumulate canvases');
  const assetResult=await page.evaluate(async()=>{
    const tools=window.__artworkTools,art=tools.artwork(),canvas=document.createElement('canvas');canvas.width=8;canvas.height=8;const ctx=canvas.getContext('2d');ctx.fillStyle='#5ac4af';ctx.fillRect(0,0,8,8);const data=canvas.toDataURL();
    const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)),sha256='sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
    art.assets=[{id:'user-png',name:'纹理',data,source:'用户提供',author:'用户',license:'用户授权',origin:'user',sha256}];art.layers=[{id:'image',shape:'image',count:1,x:0,y:0,width:1,height:1,opacity:1,rotation:0,assetId:'user-png',region:'viewport',blend:'source-over'}];
    const persisted=await tools.persistArtwork(art);const config=window.__studioStore.get(),draft={...tools.draftFromTheme(config.theme,config.customThemes),artwork:persisted.artwork};
    const packed=await tools.exportStyleBundle(config,draft),imported=tools.parseStyleBundle(packed);
    await new Promise((resolve,reject)=>{const open=indexedDB.open('dsh-artwork-assets',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('assets','readwrite');tx.objectStore('assets').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onerror=reject;};});
    const restored=await tools.persistArtwork(imported.config.customThemes[0].artwork),embedded=await tools.embedArtworkAssets(restored.artwork);
    let badHashRejected=false;try{await tools.persistArtwork({...art,assets:[{...art.assets[0],sha256:'sha256:'+'0'.repeat(64)}]});}catch{badHashRejected=true;}
    return {stripped:!persisted.artwork.assets[0].data,embedded:embedded.assets[0].data===data,version:imported.version,badHashRejected};
  });
  assert.deepEqual(assetResult,{stripped:true,embedded:true,version:2,badHashRejected:true},'asset packages must independently restore verified bytes');
  assert.deepEqual(errors,[]);
  console.log('Creator browser passed: clarification, actual 4-sample capture, no automatic save, explicit save, local recovery, reduced motion, mobile layout, capture cleanup.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
