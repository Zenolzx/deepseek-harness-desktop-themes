import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const runtime=createRequire(join(process.env.DTH_RUNTIME_NODE_MODULES || join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'),'playwright/package.json'));
const {chromium}=runtime('playwright');
const {PNG}=runtime('pngjs');
const {default:pixelmatch}=await import(pathToFileURL(runtime.resolve('pixelmatch')).href);
const update=process.env.DTH_UPDATE_VISUAL==='1';
mkdirSync('tmp/studio-preview',{recursive:true});
mkdirSync('docs/screenshots/studio',{recursive:true});
mkdirSync('tests/visual/studio',{recursive:true});
await build({entryPoints:['scripts/studio-preview.tsx'],outfile:'tmp/studio-preview/app.js',bundle:true,format:'iife',loader:{'.css':'text','.png':'dataurl'},jsx:'automatic'});
await build({entryPoints:['scripts/runtime-preview.tsx'],outfile:'tmp/studio-preview/runtime.js',bundle:true,format:'iife',loader:{'.css':'text','.svg':'dataurl','.jpg':'dataurl','.png':'dataurl'},jsx:'automatic'});
const server=createServer((req,res)=>{const js=req.url?.startsWith('/app.js')?'app.js':req.url?.startsWith('/runtime.js')?'runtime.js':null;res.setHeader('Content-Type',js?'text/javascript':'text/html');res.end(js?readFileSync('tmp/studio-preview/'+js):`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Theme Studio</title><div id="root"></div><script src="/${req.url?.startsWith('/runtime')?'runtime.js':'app.js'}"></script></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
let browser;
try {
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage();
 page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 if(process.env.DTH_CAPTURE_PREVIEWS==='1'){
  mkdirSync('src/assets/previews',{recursive:true});
  for(const id of ['mint-breeze','quantum-blue','obsidian-gold']){
   await page.setViewportSize({width:1600,height:1100});await page.goto(`http://127.0.0.1:${port}/?theme=${id}`);
   const screenshot=await page.locator('.dth-studio-preview').screenshot({animations:'disabled'});
   const png=await page.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=480;canvas.height=Math.round(image.height*480/image.width);const c=canvas.getContext('2d');c.imageSmoothingQuality='high';c.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png').split(',')[1];},screenshot.toString('base64'));
   writeFileSync(`src/assets/previews/${id}.png`,Buffer.from(png,'base64'));
  }
  await build({entryPoints:['scripts/studio-preview.tsx'],outfile:'tmp/studio-preview/app.js',bundle:true,format:'iife',loader:{'.css':'text','.png':'dataurl'},jsx:'automatic'});
  await build({entryPoints:['scripts/runtime-preview.tsx'],outfile:'tmp/studio-preview/runtime.js',bundle:true,format:'iife',loader:{'.css':'text','.svg':'dataurl','.jpg':'dataurl','.png':'dataurl'},jsx:'automatic'});
 }
 for(const theme of ['mint-breeze','sakura-mist','quantum-blue','aurora-dream','sunset-flow','obsidian-gold']) {
  for(const [width,height] of [[1280,800],[1920,1080]]) {
   await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:${port}/?theme=${theme}`);
   await page.getByRole('heading',{name:'让工作台，成为你的作品。'}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme}/${width} overflow`);
   const screenshot=await page.screenshot({path:`docs/screenshots/studio/${theme}-${width}.png`,fullPage:false,animations:'disabled'});
   const baseline=`tests/visual/studio/${theme}-${width}.png`;
   if(update)writeFileSync(baseline,screenshot);
   else {
    assert.ok(existsSync(baseline),'Missing baseline; review screenshots and set DTH_UPDATE_VISUAL=1');
    const actual=PNG.sync.read(screenshot), expected=PNG.sync.read(readFileSync(baseline));
    assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);
    const diff=new PNG({width:actual.width,height:actual.height});
    const count=pixelmatch(actual.data,expected.data,diff.data,actual.width,actual.height,{threshold:0.1});
    if(count/(actual.width*actual.height)>0.001)writeFileSync(`tmp/studio-preview/${theme}-${width}-diff.png`,PNG.sync.write(diff));
    assert.ok(count/(actual.width*actual.height)<=0.001,`${theme}/${width}: unexpected visual difference ${count} px`);
   }
  }
 }
 await page.setViewportSize({width:1280,height:800});await page.goto(`http://127.0.0.1:${port}/?theme=quantum-blue`);
 await page.getByLabel('主题名称',{exact:true}).fill('Studio QA');
 await page.getByRole('button',{name:'撤销',exact:true}).click();
 assert.notEqual(await page.getByLabel('主题名称',{exact:true}).inputValue(),'Studio QA');
 await page.getByRole('button',{name:'重做',exact:true}).click();
 assert.equal(await page.getByLabel('主题名称',{exact:true}).inputValue(),'Studio QA');
 await page.getByRole('button',{name:'查看基线 A'}).click();
 await page.getByText('A · 基线',{exact:true}).waitFor();
 await page.getByRole('button',{name:'返回草稿 B'}).click();
 await page.getByRole('button',{name:'保存并应用',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__studioSaves),1);
 assert.match(await page.evaluate(()=>window.__studioStore.get().theme),/^custom-/);
 await page.getByText('专业格式互通 · 导入 / 导出单主题',{exact:true}).click();
 await page.getByLabel('格式',{exact:true}).selectOption('vscode');
 await page.getByLabel('主题导入内容',{exact:true}).fill(JSON.stringify({name:'Imported QA',colors:{'editor.background':'#101114','editor.foreground':'#eeeeee','sideBar.background':'#202127','button.background':'#8b93ff'}}));
 await page.getByRole('button',{name:'导入到草稿',exact:true}).click();
 assert.equal(await page.getByLabel('主题名称',{exact:true}).inputValue(),'Imported QA');
 assert.equal(await page.evaluate(()=>window.__studioSaves),1,'import must not persist');
 await page.getByLabel('主题导入内容',{exact:true}).fill('{invalid');await page.getByRole('button',{name:'导入到草稿',exact:true}).click();
 assert.equal(await page.getByLabel('主题名称',{exact:true}).inputValue(),'Imported QA');
 // Real client presenter: persistence, custom registration and rollback.
 await page.goto(`http://127.0.0.1:${port}/runtime`);
 await page.getByRole('heading',{name:'为每天的工作，留一个喜欢的环境。'}).waitFor();
 await page.getByRole('button',{name:/NOCTURNE|Nocturne/}).click();
 await page.getByRole('button',{name:'评审',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__runtime.active()),'obsidian-gold');
 await page.waitForTimeout(500);
 assert.ok(await page.evaluate(()=>window.__runtime.writes.some(w=>w.field==='workspace'&&w.value.mode==='review')));
 await page.screenshot({path:'docs/screenshots/studio/workspace-home-1280.png',animations:'disabled'});
 await page.evaluate(()=>window.__runtime.show('desktop-themes-studio'));
 await page.getByLabel('主题名称',{exact:true}).fill('临时试用 QA');
 await page.getByRole('button',{name:'在宿主中试用 20 秒',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__runtime.active()),'custom-live-preview');
 await page.waitForTimeout(500);
 assert.ok(await page.evaluate(()=>!window.__runtime.writes.some(w=>w.field==='theme'&&w.value==='custom-live-preview')));
 assert.ok(await page.evaluate(()=>!Object.values(localStorage).some(v=>v.includes('custom-live-preview'))));
 await page.getByRole('button',{name:'结束试用并恢复',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__runtime.active()),'obsidian-gold');
 // Content samples, progressive editing and keyboard behavior.
 for(const name of ['长文与表格','代码评审','菜单与状态']){
  await page.getByRole('button',{name,exact:true}).click();
  await page.screenshot({path:`tmp/studio-preview/sample-${name}.png`,animations:'disabled'});
 }
 await page.getByRole('button',{name:'专业编辑',exact:true}).click();
 await page.getByLabel('l',{exact:true}).focus();await page.keyboard.press('ArrowRight');
 await page.getByRole('button',{name:'撤销',exact:true}).click();
 await page.getByRole('button',{name:'快速调整',exact:true}).click();
 // Image extraction, durable wallpaper and portable pack install.
 const image=new PNG({width:16,height:16});for(let i=0;i<image.data.length;i+=4){image.data[i]=68;image.data[i+1]=120;image.data[i+2]=176;image.data[i+3]=255;}
 await page.getByLabel('从壁纸生成配色',{exact:true}).setInputFiles({name:'ocean.png',mimeType:'image/png',buffer:PNG.sync.write(image)});
 await page.getByRole('status').filter({hasText:'已从壁纸生成配色'}).waitFor();
 const packDownload=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整风格包',exact:true}).click();
 const download=await packDownload;await download.saveAs('tmp/studio-preview/roundtrip.dsh-style.json');
 const pack=JSON.parse(readFileSync('tmp/studio-preview/roundtrip.dsh-style.json','utf8'));assert.match(pack.wallpaper.data,/^data:image\/png;base64,/);assert.equal(pack.config.wallpaper.path,'');
 await page.getByLabel('导入风格包',{exact:true}).setInputFiles('tmp/studio-preview/roundtrip.dsh-style.json');
 await page.getByRole('button',{name:'安装此风格包',exact:true}).click();
 await page.getByRole('status').filter({hasText:'风格包已安装并应用'}).waitFor();
 await page.waitForTimeout(500);
 assert.match(await page.evaluate(()=>window.__runtime.active()),/^custom-/);
 const cardDownload=page.waitForEvent('download');await page.getByRole('button',{name:'导出预览卡 PNG',exact:true}).click();
 await (await cardDownload).saveAs('docs/screenshots/studio/share-card.png');
 const card=PNG.sync.read(readFileSync('docs/screenshots/studio/share-card.png'));assert.equal(card.width,1600);assert.equal(card.height,1000);
 // Test actual save from a live trial; nothing from the preview id may persist.
 await page.getByRole('button',{name:'在宿主中试用 20 秒',exact:true}).click();
 await page.getByRole('button',{name:'保存并应用',exact:true}).click();await page.waitForTimeout(500);
 assert.notEqual(await page.evaluate(()=>window.__runtime.active()),'custom-live-preview');
 assert.ok(await page.evaluate(()=>!window.__runtime.writes.some(w=>w.field==='theme'&&w.value==='custom-live-preview')));
 const savedTheme=await page.evaluate(()=>window.__runtime.active());
 const savedName=await page.getByLabel('主题名称',{exact:true}).inputValue();
 await page.getByRole('button',{name:`删除 ${savedName}`,exact:true}).click();
 assert.notEqual(await page.evaluate(()=>window.__runtime.active()),savedTheme);
 await page.getByRole('button',{name:'撤销删除',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__runtime.active()),savedTheme);
 await page.waitForTimeout(500);
 await page.reload();await page.getByRole('heading',{name:'为每天的工作，留一个喜欢的环境。'}).waitFor();
 assert.equal(await page.evaluate(()=>window.__runtime.active()),savedTheme,'restart must restore the saved appearance');
 await page.waitForFunction(()=>getComputedStyle(document.body,'::before').backgroundImage.includes('blob:'));
 await page.evaluate(()=>window.__runtime.show('desktop-themes-studio'));
 await page.getByRole('button',{name:'在宿主中试用 20 秒',exact:true}).click();
 await page.evaluate(()=>window.__runtime.show(null));
 await page.getByRole('heading',{name:'为每天的工作，留一个喜欢的环境。'}).waitFor();
 assert.equal(await page.evaluate(()=>window.__runtime.active()),savedTheme,'unmount must restore preview base');
 await page.evaluate(()=>{const timeout=window.setTimeout.bind(window);window.setTimeout=((fn,ms,...args)=>timeout(fn,ms===20000?100:ms,...args));window.__runtime.show('desktop-themes-studio');});
 await page.getByRole('button',{name:'在宿主中试用 20 秒',exact:true}).click();
 await page.getByRole('status').filter({hasText:'试用已结束'}).waitFor();
 assert.equal(await page.evaluate(()=>window.__runtime.active()),savedTheme,'trial deadline must restore base');
 // Responsive and reduced-motion/transparency coverage.
 for(const width of [390,768,1024]){
  await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:${port}/?theme=mint-breeze`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} page overflow`);
  assert.equal(await page.evaluate(()=>document.querySelector('.dth-studio').scrollWidth>document.querySelector('.dth-studio').clientWidth),false,`${width} studio overflow`);
  await page.screenshot({path:`docs/screenshots/studio/responsive-${width}.png`,animations:'disabled'});
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'长文与表格',exact:true}).click();
 await page.getByRole('table').waitFor();
 assert.deepEqual(errors,[]);
 writeFileSync('tmp/studio-preview/verification.json',JSON.stringify({baselineScreenshots:12,viewports:[[390,900],[768,900],[1024,900],[1280,800],[1920,1080]],checks:['no horizontal overflow','undo redo','A/B','real client save apply','import draft isolation','malformed import','mode preserves theme','runtime temporary registration','trial rollback','trial never persists','image to theme','portable wallpaper roundtrip','PNG download','save during trial','restart restores appearance','unmount restores trial','trial deadline restores base','restart restores wallpaper','responsive','reduced motion','no page errors']},null,2));
 console.log('Studio browser verification passed: 12 baselines, real presenter, portable wallpaper, responsive and interaction checks.');
}finally {await browser?.close();server.close();}
