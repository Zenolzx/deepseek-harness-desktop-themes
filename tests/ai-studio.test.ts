import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultConfig } from '../src/config/defaults.ts';
import { draftFromTheme, draftIssues } from '../src/studio/model.ts';
import { AI_CHANNEL, applyDesignOutput, modelSnapshot, type DesignRequest, type DesignResult } from '../src/studio/ai-contract.ts';
import { registerAiHost, type AiHostContext } from '../src/studio/ai-host.ts';
import { createAiTransport } from '../src/studio/ai-client.ts';
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';

function snapshot(){const environment=createDefaultConfig();return {environment,draft:draftFromTheme(environment.theme,environment.customThemes)};}
const output=(theme:unknown={},environment:unknown={})=>({theme,environment,summary:'已按要求修改，其他设置保持原样。',limitations:[]});
test('local edits preserve all unrelated appearance fields, theme identity and personal settings',()=>{
  const base=snapshot();base.environment.wallpaper={...base.environment.wallpaper,enabled:true,sourceId:'user-image',path:'blob:actual-wallpaper'};
  const before=structuredClone(base);
  const result=applyDesignOutput(base,output({name:'暖灰主题'},{font:{fontSize:18}}),'v1');
  assert.equal(result.snapshot.draft.name,'暖灰主题');
  assert.equal(result.snapshot.environment.font.fontSize,18);
  assert.deepEqual(result.snapshot.environment.wallpaper,before.environment.wallpaper);
  assert.deepEqual(result.snapshot.environment.pet,before.environment.pet);
  assert.deepEqual(result.snapshot.draft.colors,before.draft.colors);
  assert.equal(result.snapshot.draft.id,before.draft.id);
  assert.deepEqual(base,before,'validation must never mutate its baseline');
  assert.deepEqual(result.changes,['theme.name','font.fontSize']);
});
test('rejects unauthorized fields, invalid types, out of range values and silently defaulted enums',()=>{
  for(const patch of [output({id:'custom-hijack'}),output({}, {pet:{enabled:false}}),output({}, {wallpaper:{path:'https://example.com'}}),output({}, {font:{fontSize:999}}),output({}, {font:{fontSize:'18'}}),output({}, {glass:{blurLevel:'fake'}}),output({colors:{text:'red'}}),output({syntax:{unknown:'#ffffff'}}),output({}, {effects:{particleColors:['url(x)']}}),output({}, {font:{fontSize:18.1}})])assert.throws(()=>applyDesignOutput(snapshot(),patch,'v1'));
  assert.throws(()=>applyDesignOutput(snapshot(),JSON.parse('{"theme":{"__proto__":{"polluted":true}},"summary":"x","limitations":[]}'),'v1'));
});
test('readability errors cannot replace a valid preview; reference assets never enter model snapshot',()=>{
  const base=snapshot();
  assert.throws(()=>applyDesignOutput(base,output({colors:{text:'#111111',background:'#111111',panel:'#111111'}}),'v1'),/可读性/);
  base.environment.pet.speechLines=['private preference'];base.environment.wallpaper.path='blob:private';
  const text=JSON.stringify(modelSnapshot(base));assert.ok(!text.includes('private'));assert.ok(!text.includes('sourceId'));assert.ok(!text.includes('performance'));
});

function harness(responses:Array<string|'error'|'incomplete'>,vision=false,modern=false){
  let handler:ConnectionRpcHandler|undefined,calls=0,uploads=0,disposed=false;
  const captured:GenerateOptions[]=[];const cleanups:Array<()=>unknown>=[];
  const routes=new Map<string,{fetch(request:Request):Promise<Response>}>();
  const services:Record<string,unknown>={
    connection:{...(modern?{fetch:{register(route:{path:string;fetch(request:Request):Promise<Response>}){routes.set(route.path,route);return ()=>{routes.delete(route.path);disposed=true;};}}}:{}),rpc:{handle(channel:string,callback:ConnectionRpcHandler){assert.equal(modern,false,'modern host must use authenticated API Fetch routes');assert.equal(channel,AI_CHANNEL);handler=callback;return async()=>{disposed=true;};}}},
    agentDefaultModel:{currentSelection:()=>({provider:'fixture',model:'fixture-model'})},
    attachments:{imageLimits:{maxImagesPerMessage:3,maxMessageImageBytes:6*1024*1024},validateImage:async()=>{},saveImage:async()=>{uploads++;return {attachmentId:'fixture',mediaType:'image/png',bytes:1,width:1,height:1};}},
    llm:{listProviders:()=>[{id:'fixture',name:'fixture'}],listModels:async()=>[{provider:'fixture',id:'fixture-model',name:'Fixture',inputModalities:vision?['text','image']:['text']}],
      async *stream(options:GenerateOptions):AsyncIterable<StreamChunk>{
        captured.push(options);const value=responses[calls++];
        if(value==='error'){yield {type:'finish',reason:{kind:'error',failure:{code:'fixture',message:'provider offline'}}};return;}
        if(value==='incomplete'){yield {type:'text-delta',index:0,text:'{"theme":'};return;}
        yield {type:'text-delta',index:0,text:value ?? ''};yield {type:'finish',reason:{kind:'stop'}};
      }},
  };
  const context:AiHostContext={get:name=>services[name],inject(_names,callback){callback(context);},effect(callback){const cleanup=callback();if(typeof cleanup==='function')cleanups.push(cleanup as ()=>unknown);}};
  registerAiHost(context);
  const transport=createAiTransport({rpc:{call:async(channel:string,endpoint:string,payload:unknown,signal?:AbortSignal)=>{
    if(channel==='/api'){
      const route=routes.get('/api/'+endpoint);if(!route)throw new Error('transport failure: HTTP 404');
      const response=await route.fetch(new Request('http://localhost/api/'+endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'fixture',method:endpoint,payload}),signal}));
      assert.equal(response.status,200);const envelope=await response.json() as {rpcId:string;result:unknown};assert.equal(envelope.rpcId,'fixture');return envelope.result;
    }
    return handler!(endpoint,payload,signal ?? new AbortController().signal);
  }}});
  const request:DesignRequest={baseVersion:'base-1',prompt:'把正文调大到18px，其他不变',snapshot:snapshot(),history:[],images:[],redesign:false};
  return {transport,request,captured,get calls(){return calls;},get uploads(){return uploads;},get disposed(){return disposed;},async dispose(){for(const cleanup of cleanups.reverse())await cleanup();}};
}
test('client → host → model → validation returns draft only and preserves long wallpaper URLs',async()=>{
  const h=harness([JSON.stringify(output({}, {font:{fontSize:18}}))]);
  h.request.snapshot.environment.wallpaper={...h.request.snapshot.environment.wallpaper,enabled:true,sourceId:'builtin:mint-breeze',path:'data:image/svg+xml,'+'x'.repeat(4000)};
  const before=structuredClone(h.request.snapshot);
  const result=await h.transport.call<DesignResult>('generate',h.request);
  assert.equal(result.baseVersion,'base-1');assert.equal(result.snapshot.environment.font.fontSize,18);
  assert.deepEqual(result.snapshot.environment.wallpaper,before.environment.wallpaper);
  assert.deepEqual(h.request.snapshot,before);
  assert.ok(!JSON.stringify(h.captured[0].messages).includes('speechLines'));
  await h.dispose();assert.equal(h.disposed,true);
});
test('invalid output is repaired once against the same baseline, and repeated failures stop',async()=>{
  const h=harness(['not JSON',JSON.stringify(output({}, {font:{fontSize:18}}))]);
  const result=await h.transport.call<DesignResult>('generate',h.request);
  assert.equal(result.snapshot.environment.font.fontSize,18);assert.equal(h.calls,2);await h.dispose();
  const broken=harness(['{}','{}',JSON.stringify(output())]);
  await assert.rejects(broken.transport.call('generate',broken.request));assert.equal(broken.calls,2);await broken.dispose();
});
test('provider failure and incomplete streams are surfaced without configuration repair attempts',async()=>{
  for(const response of ['error','incomplete'] as const){const h=harness([response]);await assert.rejects(h.transport.call('generate',h.request));assert.equal(h.calls,1);await h.dispose();}
});
test('images require declared vision support before upload; supported images use host attachments',async()=>{
  const image={id:'reference',name:'reference.png',data:'data:image/png;base64,YQ=='};
  const h=harness([JSON.stringify(output())]);h.request.images=[image];
  await assert.rejects(h.transport.call('generate',h.request),/图片理解/);assert.equal(h.calls,0);assert.equal(h.uploads,0);await h.dispose();
  const supported=harness([JSON.stringify(output())],true);supported.request.images=[image];
  await supported.transport.call('generate',supported.request);assert.equal(supported.uploads,1);
  assert.ok(supported.captured[0].messages[0].content.some(block=>block.type==='image'));await supported.dispose();
});
test('already cancelled requests never return a valid design',async()=>{
  const h=harness([JSON.stringify(output())]),controller=new AbortController();controller.abort();
  await assert.rejects(h.transport.call('generate',h.request,controller.signal),/取消|abort/i);await h.dispose();
});
test('modern hosts expose models and generation through authenticated /api Fetch routes',async()=>{
  const h=harness([JSON.stringify(output({name:'青绿水光'}))],false,true);
  const models=await h.transport.call<{current:{model:string}}>('models',{});assert.equal(models.current.model,'fixture-model');
  const result=await h.transport.call<DesignResult>('generate',h.request);assert.equal(result.snapshot.draft.name,'青绿水光');
  await h.dispose();assert.equal(h.disposed,true);
});
test('AI repairs a pale teal theme against derived surfaces while preserving its ambience and typography',async()=>{
  const h=harness([JSON.stringify(output({colors:{primary:'#4f9085'}}))],false,true);
  const before=structuredClone(h.request.snapshot);
  assert.throws(()=>applyDesignOutput(before,output({colors:{primary:'#4f9085'}}),'strict'),/可读性/);
  const result=await h.transport.call<DesignResult>('generate',h.request);
  assert.deepEqual(draftIssues(result.snapshot.draft),[]);
  assert.notEqual(result.snapshot.draft.colors.primary,'#4f9085');
  assert.deepEqual(result.snapshot.environment,before.environment);
  for(const key of ['background','panel','accent','glow','particle'] as const)assert.equal(result.snapshot.draft.colors[key],before.draft.colors[key]);
  assert.match(result.summary,/可读性自动修正.*主强调色/);
  assert.ok(result.changes.includes('theme.colors.primary'));assert.equal(h.calls,1,'contrast-only repairs need no second model call');
  await h.dispose();
});
test('automatic contrast repair never bypasses structural validation or accepts irreconcilable surfaces',()=>{
  const base=snapshot();
  assert.throws(()=>applyDesignOutput(base,output({}, {font:{fontSize:999}}),'v',{repairReadability:true}),/范围/);
  assert.throws(()=>applyDesignOutput(base,output({colors:{background:'#000000',panel:'#ffffff'}}),'v',{repairReadability:true}),/可读性/);
});
