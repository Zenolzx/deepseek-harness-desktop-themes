const assert=require('node:assert/strict');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const [asar,root]=process.argv.slice(2);
  const runtime=name=>import(pathToFileURL(join(asar,'dsh','node_modules','@deepseek-ai',name,'lib','index.js')).href);
  const {Context,Service}=await runtime('cordis');
  const {HostConnectionService}=await runtime('dsh-client-connection');
  const {apply}=await import(pathToFileURL(join(root,'lib','index.js')).href);
  const {createDefaultConfig,draftFromTheme}=await import(pathToFileURL(join(root,'tmp','desktop-ai-fixture.mjs')).href);
  const ctx=new Context();
  class Server extends Service{constructor(c){super(c,'webServer');}register(){return ()=>{};}}
  class Llm extends Service{
    constructor(c){super(c,'llm');}
    listProviders(){return [];}
    async *stream(){yield {type:'text-delta',index:0,text:JSON.stringify({theme:{name:'青绿淡雅水光'},summary:'已调整主题名称，保留其他外观。',limitations:[]})};yield {type:'finish',reason:{kind:'stop'}};}
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
    assert.equal(response.status,200);const design=await response.json();assert.equal(design.result.ok,true);assert.equal(design.result.value.snapshot.draft.name,'青绿淡雅水光');assert.equal(design.result.value.baseVersion,'runtime-base');
    const unauthorized=await carrier.fetch(request('models',{}),{principal:{kind:'guest'}});assert.equal(unauthorized.status,403);
    console.log('Installed Electron runtime passed: Cordis service lifecycle, authenticated /api routing, models, generation, RPC correlation and owner fence. No real model calls.');
  }finally{await ctx.fiber.dispose();}
})().catch(error=>{console.error(error);process.exitCode=1;});
