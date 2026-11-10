import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LlmRuntime } from '@deepseek-ai/dsh-llm';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import { ThemeCreator, readInspection } from '../src/design/creator-host.ts';
import { createDefaultConfig } from '../src/config/defaults.ts';
import { draftFromTheme } from '../src/studio/model.ts';
import type { DesignRequest } from '../src/studio/ai-contract.ts';
import type { CreatorReply, Inspection } from '../src/design/creator-contract.ts';
import { artwork } from './fixtures/artwork.ts';
const selection={provider:'fixture',model:'text'};
function request():DesignRequest{const c=createDefaultConfig();return {baseVersion:'v1',prompt:'用自然轮廓表现青绿清雅的意向',snapshot:{environment:c,draft:draftFromTheme(c.theme,c.customThemes)},history:[],images:[],redesign:false};}
function design(){return {action:'design',theme:{name:'青绿轮廓'},environment:{effects:{preset:'none',enabled:false}},summary:'使用原创曲线路径表现意向。',limitations:[],artwork:artwork()};}
function creator(outputs:unknown[]){let calls=0;const runtime=new ThemeCreator({llm:{} as LlmRuntime,attachments:()=>undefined,catalog:async()=>({current:selection,models:[{...selection,name:'text',vision:false}],imagesAvailable:false}),collect:async()=>{calls++;if(!outputs.length)throw new Error('unexpected call');const output=outputs.shift();return typeof output==='string'?output:JSON.stringify(output);}});return {runtime,calls:()=>calls};}
function inspection():Inspection{return {errors:[],roundTrip:true,samples:[{width:1280,height:800,phase:0,state:'reading'},{width:1280,height:800,phase:4,state:'menu'},{width:390,height:844,phase:8,state:'document'},{width:390,height:844,phase:0,state:'reduced-motion'}].map(s=>({...s,frameMs:4,image:'data:image/png;base64,AAAA'}))};}
function render(reply:CreatorReply){assert.equal(reply.kind,'render');if(reply.kind!=='render')throw new Error('not render');return reply;}
test('creator runs actual render gate before manual-review preview, evidence nonce is single-use',async()=>{
  const {runtime}=creator([design()]),signal=new AbortController().signal;
  const candidate=render(await runtime.start(request(),selection,signal));
  await assert.rejects(()=>runtime.inspect({...candidate,nonce:'forged',inspection:inspection()},signal),/版本/);
  const complete=await runtime.inspect({...candidate,inspection:inspection()},signal);
  assert.equal(complete.kind,'complete');if(complete.kind==='complete'){assert.equal(complete.review,'manual');assert.equal(complete.result.baseVersion,'v1');assert.match(complete.result.limitations.join(''),/人工|审阅/);}
  await assert.rejects(()=>runtime.inspect({...candidate,inspection:inspection()},signal),/过期/);
});
test('creator asks only when requested by the planner and does not mutate original draft',async()=>{
  const {runtime}=creator([{action:'ask',question:'是否可以直接使用参考图？',recommendation:'默认只参考构图。'}]);const req=request(),before=JSON.stringify(req);
  assert.equal((await runtime.start(req,selection,new AbortController().signal)).kind,'question');assert.equal(JSON.stringify(req),before);
});
test('hard render failures are repaired with a fresh nonce, old reports cannot authorize the revision',async()=>{
  const {runtime}=creator([design(),design()]),signal=new AbortController().signal;
  const first=render(await runtime.start(request(),selection,signal));const failure=inspection();failure.errors=['保护区检查失败'];
  const second=render(await runtime.inspect({...first,inspection:failure},signal));assert.notEqual(first.nonce,second.nonce);
  await assert.rejects(()=>runtime.inspect({...second,nonce:first.nonce,inspection:inspection()},signal),/版本/);
  assert.equal((await runtime.inspect({...second,inspection:inspection()},signal)).kind,'complete');
});
test('unregistered assets cannot be inserted; repair allowance is bounded to three',async()=>{
  const bad={...design(),artwork:{...artwork(),assets:['reference-without-consent']}};
  const {runtime,calls}=creator([bad,bad,bad,bad]);await assert.rejects(()=>runtime.start(request(),selection,new AbortController().signal),/三轮/);assert.equal(calls(),4);
});
test('cancelled tasks and incomplete viewport/phase evidence cannot deliver a preview',async()=>{
  assert.throws(()=>readInspection({...inspection(),samples:inspection().samples.slice(1)},12),/不完整/);
  assert.throws(()=>readInspection({...inspection(),samples:inspection().samples.map(s=>({...s,phase:9}))},12),/相位/);
  const {runtime}=creator([design()]),signal=new AbortController().signal,candidate=render(await runtime.start(request(),selection,signal));runtime.cancel(candidate);
  await assert.rejects(()=>runtime.inspect({...candidate,inspection:inspection()},signal),/过期/);
});
test('malformed JSON is repaired, provider failures stop immediately',async()=>{
  const valid=creator(['not json',design()]);assert.equal((await valid.runtime.start(request(),selection,new AbortController().signal)).kind,'render');assert.equal(valid.calls(),2);
  const offline=creator([]);await assert.rejects(()=>offline.runtime.start(request(),selection,new AbortController().signal),/unexpected call/);assert.equal(offline.calls(),1);
});
test('non-visual structural critique can reject misleading motion claims without claiming image review',async()=>{
  const {runtime}=creator([design(),{pass:false,evidence:['仅整体平移，未改变控制点'],issues:['请让路径形态随时间改变']},design(),{pass:true,evidence:['控制点含时间表达式'],issues:[]}]);
  const signal=new AbortController().signal,first=render(await runtime.start(request(),selection,signal));
  const report={...inspection(),signals:[{id:'contours',coverage:.01,peakDelta:.03,motion:'geometry' as const}]};
  const second=render(await runtime.inspect({...first,inspection:report},signal)),complete=await runtime.inspect({...second,inspection:report},signal);
  assert.equal(complete.kind,'complete');if(complete.kind==='complete'){assert.equal(complete.review,'manual');assert.match(complete.evidence.join(''),/非视觉验收/);}
});
test('visual collaborator receives real captures; failing findings require a fresh rendered revision',async()=>{
  const outputs:unknown[]=[design(),{pass:false,evidence:['边缘线条过密'],issues:['减少边缘线条']},design(),{pass:true,evidence:['线条与稳定阅读面清楚分离'],issues:[]}];
  let uploads=0;
  const store={imageLimits:{maxImagesPerMessage:3,maxMessageImageBytes:6*1024*1024},validateImage:async()=>{},saveImage:async()=>{uploads++;return {attachmentId:'fixture',mediaType:'image/png',bytes:3,width:1,height:1};}} as unknown as AttachmentStore;
  const runtime=new ThemeCreator({llm:{} as LlmRuntime,attachments:()=>store,catalog:async()=>({current:selection,models:[{...selection,name:'vision',vision:true}],imagesAvailable:true}),collect:async(_llm,options)=>{if(options.system?.includes('验收员'))assert.equal(options.messages[0].content.filter(b=>b.type==='image').length,2);return JSON.stringify(outputs.shift());}});
  const signal=new AbortController().signal,first=render(await runtime.start(request(),selection,signal)),second=render(await runtime.inspect({...first,inspection:inspection()},signal));
  const complete=await runtime.inspect({...second,inspection:inspection()},signal);assert.equal(complete.kind,'complete');if(complete.kind==='complete')assert.equal(complete.review,'visual');assert.equal(uploads,4);
});
test('invalid visual reports remain manual review instead of claiming visual pass',async()=>{
  let call=0;
  const store={imageLimits:{maxImagesPerMessage:3,maxMessageImageBytes:6*1024*1024},validateImage:async()=>{},saveImage:async()=>({attachmentId:'fixture'})} as unknown as AttachmentStore;
  const runtime=new ThemeCreator({llm:{} as LlmRuntime,attachments:()=>store,catalog:async()=>({current:selection,models:[{...selection,name:'vision',vision:true}],imagesAvailable:true}),collect:async()=>JSON.stringify(call++===0?design():{pass:false,evidence:['未知'],issues:[]})});
  const signal=new AbortController().signal,candidate=render(await runtime.start(request(),selection,signal)),complete=await runtime.inspect({...candidate,inspection:inspection()},signal);
  assert.equal(complete.kind,'complete');if(complete.kind==='complete')assert.equal(complete.review,'manual');
});
test('Commons search admits licensed official raster results and binds model references to registered bytes',async()=>{
  const originalFetch=globalThis.fetch,urls:string[]=[];
  globalThis.fetch=async(input)=>{
    const url=String(input);urls.push(url);
    if(url.startsWith('https://commons.wikimedia.org/w/api.php'))return Response.json({query:{pages:{good:{title:'File:Texture.png',imageinfo:[{url:'https://upload.wikimedia.org/texture.png',descriptionurl:'https://commons.wikimedia.org/wiki/File:Texture.png',mime:'image/png',extmetadata:{LicenseShortName:{value:'CC BY 4.0'},Artist:{value:'Artist'}}}]},bad:{title:'File:Forbidden.png',imageinfo:[{url:'https://untrusted.example/image.png',descriptionurl:'https://untrusted.example/',mime:'image/png',extmetadata:{LicenseShortName:{value:'CC BY 4.0'}}}]}}}});
    assert.equal(url,'https://upload.wikimedia.org/texture.png');return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
  };
  try{
    let calls=0;
    const runtime=new ThemeCreator({llm:{} as LlmRuntime,attachments:()=>undefined,catalog:async()=>({current:selection,models:[],imagesAvailable:false}),collect:async(_llm,options)=>{
      if(calls++===0)return JSON.stringify({action:'search',query:'natural texture'});
      const block=options.messages.at(-1)!.content[0];assert.equal(block.type,'text');if(block.type!=='text')throw new Error('missing registry');
      const assets=JSON.parse(block.text).registeredAssets;assert.equal(assets.length,1);assert.equal(assets[0].data,undefined);
      const doc=artwork();doc.layers=[{id:'material',shape:'image',count:1,x:0,y:0,width:1,height:1,rotation:0,opacity:.3,region:'viewport',blend:'source-over',assetId:assets[0].id}];
      return JSON.stringify({...design(),artwork:{...doc,assets:[assets[0].id]}});
    }});
    const candidate=render(await runtime.start(request(),selection,new AbortController().signal));assert.equal(candidate.snapshot.draft.artwork!.assets[0].author,'Artist');assert.match(candidate.snapshot.draft.artwork!.assets[0].sha256,/^sha256:/);assert.equal(urls.length,2);
  }finally{globalThis.fetch=originalFetch;}
});
