import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDesign, consumeRepair, designDigest, DESIGN_AREAS, inspectDesignPlan, TECHNICAL_CHECKS, type GateContext, type RuntimeEvidence, type ThemeDesignPlan } from '../src/design/contract.ts';

function fixture(){
  const plan:ThemeDesignPlan={version:1,id:'draft-1',baseVersion:'base-1',requirements:[{id:'style',text:'复古印刷感，文字清楚',priority:'must'},{id:'font',text:'保留当前字体',priority:'must'}],
    decisions:Object.fromEntries(DESIGN_AREAS.map(area=>[area,{decision:area==='motionAndStates'?'静态构图，保留焦点与状态':'按印刷意向决定层次并保留原字体',implementationRefs:[area==='colorAndReading'?'config:font':'config:theme'],verification:['检查实际合成预览与不同尺寸'],requirementIds:area==='colorAndReading'?['style','font']:['style']}])) as ThemeDesignPlan['decisions'],assets:[],programs:[],layers:[]};
  const context:GateContext={currentBaseVersion:'base-1',activeInspectionId:'inspection-1',capabilities:{revision:'caps-1',renderAvailable:true,visualReviewAvailable:true,regions:['background','sidebar','reading','composer'],backends:new Map([['fixture-draw',{languages:['draw-v1'],isolated:true,maxSourceBytes:4096}]]),budget:{maxLayers:16,maxPrograms:8,maxAssets:16,maxProgramBytes:8192}},assets:new Map(),evidence:new Map()};
  return {plan,context};
}
async function report(plan:ThemeDesignPlan,context:GateContext,kind:RuntimeEvidence['kind']='technical',id:string=kind):Promise<RuntimeEvidence>{
  return {id,inspectionId:context.activeInspectionId,kind,documentDigest:await designDigest(plan),baseVersion:context.currentBaseVersion,capabilityRevision:context.capabilities.revision,status:'pass',...(kind==='technical'?{checks:Object.fromEntries(TECHNICAL_CHECKS.map(k=>[k,'pass']))}:{requirements:Object.fromEntries(plan.requirements.map(r=>[r.id,'pass']))})};
}
function registry(context:GateContext,...reports:RuntimeEvidence[]){context.evidence=new Map(reports.map(r=>[r.id,r]));}

test('every required design responsibility and user requirement needs an explicit decision',()=>{
  const {plan,context}=fixture();assert.deepEqual(inspectDesignPlan(plan,context),[]);
  const incomplete=structuredClone(plan);delete (incomplete.decisions as Partial<typeof incomplete.decisions>).composition;
  assert.ok(inspectDesignPlan(incomplete,context).some(p=>p.code==='incomplete-design'&&p.path.endsWith('composition')));
  plan.decisions.colorAndReading.requirementIds=['style'];assert.ok(inspectDesignPlan(plan,context).some(p=>p.code==='uncovered-requirement'));
});
test('reference screenshots cannot silently become a background even when a local file exists',()=>{
  const {plan,context}=fixture();plan.assets=[{id:'screenshot',role:'reference',resourceId:'image-1'}];
  plan.layers=[{id:'bg',target:'background',assetId:'screenshot',animated:false}];
  assert.ok(inspectDesignPlan(plan,context).some(p=>p.code==='invalid-asset-use'));
  plan.assets[0].role='background';
  context.assets=new Map([['image-1',{id:'image-1',sha256:'sha256:'+'a'.repeat(64),mediaType:'image/png',bytes:100,local:true,usable:true,referenceOnly:true,allowedRoles:['reference'],provenanceReceiptId:'upload-1',origin:'user'}]]);
  assert.ok(inspectDesignPlan(plan,context).some(p=>p.code==='asset-not-admitted'));
  context.assets=new Map([['image-1',{...context.assets.get('image-1')!,referenceOnly:false,allowedRoles:['background'],provenanceReceiptId:'user-approved-background'}]]);
  assert.deepEqual(inspectDesignPlan(plan,context),[]);
  plan.assets[0].role='texture';assert.ok(inspectDesignPlan(plan,context).some(p=>p.code==='asset-not-admitted'),'background permission does not silently authorize a different material role');
});
test('programs require real supported backends, isolation, resource budgets and static fallbacks',()=>{
  const {plan,context}=fixture();plan.programs=[{id:'shapes',backend:'fixture-draw',language:'draw-v1',source:'bounded drawing fixture'}];
  plan.layers=[{id:'shapes-layer',target:'background',programId:'shapes',animated:true,staticProgramId:'shapes'}];
  assert.deepEqual(inspectDesignPlan(plan,context),[]);
  context.capabilities.backends=new Map();assert.ok(inspectDesignPlan(plan,context).some(p=>p.code==='backend-unavailable'));
  context.capabilities.backends=new Map([['fixture-draw',{languages:['draw-v1'],isolated:false,maxSourceBytes:2}]]);
  const problems=inspectDesignPlan(plan,context);assert.ok(problems.some(p=>p.code==='backend-unavailable'));assert.ok(problems.some(p=>p.code==='budget-exceeded'));
  delete plan.layers[0].staticProgramId;assert.ok(inspectDesignPlan(plan,context).some(p=>p.code==='missing-static-fallback'));
});
test('missing real rendering and stale baselines block creation instead of claiming completion',()=>{
  const {plan,context}=fixture();context.capabilities.renderAvailable=false;context.currentBaseVersion='base-2';
  const codes=inspectDesignPlan(plan,context).map(p=>p.code);assert.ok(codes.includes('render-unavailable'));assert.ok(codes.includes('stale-version'));
});
test('model-written pass flags and nonexistent receipts never satisfy hard gates',async()=>{
  const {plan,context}=fixture();
  const result=await assessDesign({...plan,checks:{contrast:'pass'}},['invented-pass'],context);
  assert.equal(result.previewReady,false);assert.equal(result.applyReady,false);assert.ok(result.problems.some(p=>p.code==='unknown-field'));assert.ok(result.problems.some(p=>p.code==='invalid-evidence'));
});
test('changing design content or capabilities invalidates previous evidence',async()=>{
  const {plan,context}=fixture(),receipt=await report(plan,context);registry(context,receipt);
  plan.decisions.composition.decision='重新安排视觉重心';
  assert.ok((await assessDesign(plan,[receipt.id],context)).problems.some(p=>p.code==='invalid-evidence'));
  const fresh=await report(plan,context);registry(context,fresh);context.capabilities.revision='caps-2';
  assert.ok((await assessDesign(plan,[fresh.id],context)).problems.some(p=>p.code==='invalid-evidence'));
});
test('technical pass allows preview but only reviewed and explicitly approved versions allow apply',async()=>{
  const {plan,context}=fixture(),technical=await report(plan,context),visual=await report(plan,context,'visual'),approval=await report(plan,context,'user-approval');
  registry(context,technical);
  assert.equal((await assessDesign(plan,[technical.id],context)).previewReady,true);
  registry(context,technical,visual);
  assert.equal((await assessDesign(plan,[technical.id,visual.id],context)).applyReady,false);
  registry(context,technical,visual,approval);
  assert.equal((await assessDesign(plan,[technical.id,visual.id,approval.id],context)).applyReady,true);
  technical.checks!.contrast='fail';assert.equal((await assessDesign(plan,[technical.id,visual.id,approval.id],context)).applyReady,false);
});
test('no visual model permits honest human review without turning unknown into machine pass',async()=>{
  const {plan,context}=fixture();context.capabilities.visualReviewAvailable=false;
  const technical=await report(plan,context),approval=await report(plan,context,'user-approval');registry(context,technical);
  const preview=await assessDesign(plan,[technical.id],context);assert.equal(preview.review,'human-required');assert.equal(preview.applyReady,false);
  registry(context,technical,approval);
  const accepted=await assessDesign(plan,[technical.id,approval.id],context);assert.equal(accepted.review,'human-verified');assert.equal(accepted.applyReady,true);
});
test('contradictory technical reports and unknown visual results cannot be promoted to passed',async()=>{
  const {plan,context}=fixture(),technical=await report(plan,context),visual=await report(plan,context,'visual'),approval=await report(plan,context,'user-approval');
  registry(context,technical,visual,approval);technical.status='fail';
  assert.equal((await assessDesign(plan,[technical.id,visual.id,approval.id],context)).previewReady,false);
  technical.status='pass';visual.requirements!.style='unknown';
  const result=await assessDesign(plan,[technical.id,visual.id,approval.id],context);assert.equal(result.review,'pending');assert.equal(result.applyReady,false);
});
test('not applicable is narrowly allowed for no-resource/no-program designs, never for readability',async()=>{
  const {plan,context}=fixture(),technical=await report(plan,context);registry(context,technical);
  technical.checks!.resources='not-applicable';technical.checks!.programIsolation='not-applicable';
  assert.equal((await assessDesign(plan,[technical.id],context)).previewReady,true);
  technical.checks!.contrast='not-applicable';assert.equal((await assessDesign(plan,[technical.id],context)).previewReady,false);
});
test('automatic repair limits survive internal retries and do not mutate the budget',()=>{
  const initial={requestId:'user-request-1',used:0,limit:3 as const};let budget=initial;
  for(let i=0;i<3;i++)budget=consumeRepair(budget,'user-request-1');
  assert.equal(initial.used,0);assert.equal(budget.used,3);
  assert.throws(()=>consumeRepair(budget,'user-request-1'),/三轮/);
  assert.throws(()=>consumeRepair(initial,'internal-retry-2'),/重置/);
});
test('content digests are stable across key order and malformed budgets fail closed',async()=>{
  assert.equal(await designDigest({b:2,a:1}),await designDigest({a:1,b:2}));
  const {plan,context}=fixture();context.capabilities.budget.maxLayers=Number.NaN;
  assert.ok(inspectDesignPlan(plan,context).some(p=>p.code==='invalid-capabilities'));
  const result=await assessDesign({...plan,id:undefined},[],context);assert.equal(result.applyReady,false);assert.ok(result.problems.some(p=>p.code==='invalid-json'));
});
test('models cannot omit an unfavorable report, while a new host inspection supersedes old failures',async()=>{
  const {plan,context}=fixture(),passed=await report(plan,context),failed=await report(plan,context,'technical','failed-layout');failed.checks!.layout='fail';failed.status='fail';
  registry(context,passed,failed);
  assert.equal((await assessDesign(plan,[passed.id],context)).previewReady,false,'omitting a failure does not remove it from the active batch');
  context.activeInspectionId='inspection-2';const fresh=await report(plan,context,'technical','fresh');registry(context,passed,failed,fresh);
  assert.equal((await assessDesign(plan,[fresh.id],context)).previewReady,true,'a complete new host-owned batch supersedes the old batch without erasing history');
});
test('production material cannot masquerade as delivered while no layer uses it',()=>{
  const {plan,context}=fixture();plan.assets=[{id:'photo',role:'subject',resourceId:'image'}];
  assert.ok(inspectDesignPlan(plan,context).some(p=>p.code==='unused-production-asset'));
});
test('explicit human aesthetic acceptance can supersede visual-model judgment but never technical failures',async()=>{
  const {plan,context}=fixture(),technical=await report(plan,context),visual=await report(plan,context,'visual'),approval=await report(plan,context,'user-approval');
  visual.status='fail';visual.requirements!.style='fail';approval.reviewMode='manual';registry(context,technical,visual,approval);
  const accepted=await assessDesign(plan,[],context);assert.equal(accepted.applyReady,true);assert.equal(accepted.review,'human-verified');
  technical.checks!.contrast='fail';assert.equal((await assessDesign(plan,[],context)).applyReady,false);
});
