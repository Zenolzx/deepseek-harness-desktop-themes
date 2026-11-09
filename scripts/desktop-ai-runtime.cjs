const assert=require('node:assert/strict');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const [asar,root]=process.argv.slice(2);
  const runtime=name=>import(pathToFileURL(join(asar,'dsh','node_modules','@deepseek-ai',name,'lib','index.js')).href);
  const {Context,Service}=await runtime('cordis');
  const {HostConnectionService}=await runtime('dsh-client-connection');
  const {apply}=await import(pathToFileURL(join(root,'lib','index.js')).href);
  const {createDefaultConfig,draftFromTheme,artwork}=await import(pathToFileURL(join(root,'tmp','desktop-ai-fixture.mjs')).href);
  const ctx=new Context();
  class Server extends Service{constructor(c){super(c,'webServer');}register(){return ()=>{};}}
  class Llm extends Service{
    constructor(c){super(c,'llm');}
    listProviders(){return [];}
    async *stream(options){const creative=options.system.includes('桌面主题创作代理');if(creative)assert.ok(options.system.includes('执行与交付门禁'),'bundled skill rules must reach the actual host model request');yield {type:'text-delta',index:0,text:JSON.stringify({...creative?{action:'design',artwork:artwork()}:{},theme:{name:'青绿淡雅水光',colors:{primary:'#4f9085'}},summary:'已调整主题名称与青绿强调色。',limitations:[]})};yield {type:'finish',reason:{kind:'stop'}};}
  }
  class Defaults extends Service{constructor(c){super(c,'agentDefaultModel');}currentSelection(){return {provider:'fixture',model:'fixture'};}}
  try{
    await ctx.plugin(Server);await ctx.plugin(Llm);await ctx.plugin(Defaults);
    await ctx.plugin(c=>{new HostConnectionService(c,[],{isAuthenticated(){return true;}});});
    await ctx.plugin({apply});await new Promise(resolve=>setTimeout(resolve,50));
    for(const runtime of ctx.registry.values())for(const fiber of runtime.fibers)if(fiber._error)throw fiber._error;
    const carrier=ctx.get('connection').createSharedFetchHandler('/api');
    const owner={principal:{kind:'owner'}};
    const request=(endpoint,payload)=>new Request('http://localhost/api/desktop-themes-ai/'+endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'runtime-probe',method:'desktop-themes-ai/'+endpoint,payload})});
    const models=await carrier.fetch(request('models',{}),owner);assert.equal(models.status,200);
    const catalog=await models.json();assert.equal(catalog.rpcId,'runtime-probe');assert.equal(catalog.result.value.current.model,'fixture');
    const environment=createDefaultConfig();
    const response=await carrier.fetch(request('generate',{baseVersion:'runtime-base',prompt:'青绿淡雅风格，保持字体',snapshot:{environment,draft:draftFromTheme(environment.theme,environment.customThemes)},history:[],images:[],redesign:false}),owner);
    assert.equal(response.status,200);const design=await response.json();assert.equal(design.result.ok,true);assert.equal(design.result.value.snapshot.draft.name,'青绿淡雅水光');assert.equal(design.result.value.baseVersion,'runtime-base');assert.match(design.result.value.summary,/可读性自动修正/);assert.notEqual(design.result.value.snapshot.draft.colors.primary,'#4f9085');
    assert.equal(catalog.result.value.creatorAvailable,true);
    const created=await carrier.fetch(request('create',{baseVersion:'creator-base',prompt:'自然曲线与青绿氛围',snapshot:{environment,draft:draftFromTheme(environment.theme,environment.customThemes)},history:[],images:[],redesign:false}),owner);
    const candidate=(await created.json()).result;assert.equal(candidate.ok,true);assert.equal(candidate.value.kind,'render');assert.equal(candidate.value.snapshot.draft.artwork.layers[0].shape,'path');
    const samples=[{width:1280,height:800,phase:0,state:'reading'},{width:1280,height:800,phase:4,state:'menu'},{width:390,height:844,phase:8,state:'document'},{width:390,height:844,phase:0,state:'reduced-motion'}].map(s=>({...s,frameMs:2,image:'data:image/png;base64,AAAA'}));
    const checked=await carrier.fetch(request('inspect',{...candidate.value,inspection:{samples,errors:[],roundTrip:true}}),owner);const complete=(await checked.json()).result;
    assert.equal(complete.ok,true);assert.equal(complete.value.kind,'complete');assert.equal(complete.value.review,'manual');assert.equal(complete.value.result.baseVersion,'creator-base');
    const unauthorized=await carrier.fetch(request('models',{}),{principal:{kind:'guest'}});assert.equal(unauthorized.status,403);
    console.log('Installed Electron runtime passed: authenticated /api routing, models, legacy generation, creative skill loading, render/inspect continuation, manual review and owner fence. No real model calls.');
  }finally{await ctx.fiber.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
