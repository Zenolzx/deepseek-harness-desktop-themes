/** Theme creation protocol v1. Not a renderer or a declaration of available tools. */
export const DESIGN_AREAS = ['intent','composition','colorAndReading','patternsAndAssets','materialsAndLighting','motionAndStates','adaptationAndDelivery'] as const;
export type DesignArea = typeof DESIGN_AREAS[number];
export type CheckStatus = 'pass'|'fail'|'unknown'|'not-applicable';
export const TECHNICAL_CHECKS = ['structure','resources','programIsolation','layout','contrast','performance','reducedMotion','lifecycle','roundTrip'] as const;
export type TechnicalCheck = typeof TECHNICAL_CHECKS[number];
export interface DesignDecision { decision:string; implementationRefs:string[]; verification:string[]; requirementIds:string[] }
export interface AssetUse { id:string; role:'reference'|'subject'|'background'|'texture'; resourceId?:string }
export interface ProgramSource { id:string; backend:string; language:string; source:string }
export interface DesignLayer { id:string; target:string; programId?:string; assetId?:string; animated:boolean; staticProgramId?:string }
export interface ThemeDesignPlan {
  version:1; id:string; baseVersion:string;
  requirements:Array<{id:string;text:string;priority:'must'|'prefer'|'avoid'}>;
  decisions:Record<DesignArea,DesignDecision>;
  assets:AssetUse[]; programs:ProgramSource[]; layers:DesignLayer[];
}
/** These facts originate in host tools, never in model-supplied plan fields. */
export interface RegisteredAsset {
  id:string; sha256:string; mediaType:string; bytes:number;
  local:boolean; usable:boolean; referenceOnly:boolean; allowedRoles:readonly AssetUse['role'][]; provenanceReceiptId:string; origin:'user'|'search'|'generated';
}
export interface DesignCapabilities {
  /** visualReviewAvailable means both actual capture and a visual model work. */
  revision:string; renderAvailable:boolean; visualReviewAvailable:boolean;
  regions:readonly string[];
  backends:ReadonlyMap<string,{languages:readonly string[];isolated:boolean;maxSourceBytes:number}>;
  budget:{maxLayers:number;maxPrograms:number;maxAssets:number;maxProgramBytes:number};
}
export interface DesignProblem { code:string; path:string; message:string }
export interface RuntimeEvidence {
  id:string; inspectionId:string; kind:'technical'|'visual'|'user-approval';
  documentDigest:string; baseVersion:string; capabilityRevision:string;
  checks?:Partial<Record<TechnicalCheck,CheckStatus>>;
  requirements?:Record<string,CheckStatus>;
  status:CheckStatus;
  /** Host records explicit human review/acceptance of the visual result. */
  reviewMode?:'automatic'|'manual';
}
export interface GateContext {
  currentBaseVersion:string; activeInspectionId:string; capabilities:DesignCapabilities;
  assets:ReadonlyMap<string,RegisteredAsset>;
  evidence:ReadonlyMap<string,RuntimeEvidence>;
}
export interface DesignAssessment {
  documentDigest:string; problems:DesignProblem[];
  previewReady:boolean; applyReady:boolean; review:'verified'|'human-required'|'human-verified'|'pending';
}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function text(value:unknown,max=4000):value is string{return typeof value==='string'&&value.trim().length>0&&value.length<=max;}
function strings(value:unknown):value is string[]{return Array.isArray(value)&&value.length<=64&&value.every(v=>text(v,256));}
function exact(value:Record<string,unknown>,keys:readonly string[],path:string,problems:DesignProblem[]){
  for(const key of Object.keys(value))if(!keys.includes(key))problems.push({code:'unknown-field',path:`${path}.${key}`,message:'未定义的协议字段'});
}

/** Structural and capability admission; no claim of visual or runtime execution success. */
export function inspectDesignPlan(input:unknown,context:GateContext):DesignProblem[]{
  const problems:DesignProblem[]=[];
  const add=(code:string,path:string,message:string)=>problems.push({code,path,message});
  if(!record(input))return [{code:'invalid-plan',path:'plan',message:'设计文档必须为对象'}];
  if(!text(context.capabilities.revision,128)||(['maxLayers','maxPrograms','maxAssets','maxProgramBytes'] as const).some(k=>!Number.isSafeInteger(context.capabilities.budget[k])||context.capabilities.budget[k]<0))return [{code:'invalid-capabilities',path:'capabilities',message:'缺少有效能力版本或有限资源预算'}];
  exact(input,['version','id','baseVersion','requirements','decisions','assets','programs','layers'],'plan',problems);
  if(input.version!==1||!text(input.id,128))add('invalid-plan','plan.version','未知协议版本或无效标识');
  if(input.baseVersion!==context.currentBaseVersion)add('stale-version','plan.baseVersion','设计基准已变化');
  const requirements=Array.isArray(input.requirements)?input.requirements:[];
  if(!requirements.length||requirements.length>64)return [{code:'invalid-requirements',path:'plan.requirements',message:'需要 1–64 条明确要求'}];
  const requirementIds=new Set<string>();
  for(const requirement of requirements){
    if(!record(requirement)||!text(requirement.id,128)||!text(requirement.text)||!['must','prefer','avoid'].includes(String(requirement.priority))){add('invalid-requirement','plan.requirements','要求格式无效');continue;}
    exact(requirement,['id','text','priority'],'plan.requirements',problems);
    if(requirementIds.has(requirement.id))add('duplicate-id','plan.requirements','要求标识重复');
    requirementIds.add(requirement.id);
  }
  const groups=['assets','programs','layers'] as const;
  const budgets={assets:context.capabilities.budget.maxAssets,programs:context.capabilities.budget.maxPrograms,layers:context.capabilities.budget.maxLayers};
  const ids={assets:new Set<string>(),programs:new Set<string>(),layers:new Set<string>()};
  for(const group of groups){
    if(!Array.isArray(input[group])){add('invalid-array',`plan.${group}`,'应为数组');continue;}
    const list=input[group];
    if(list.length>budgets[group]){add('budget-exceeded',`plan.${group}`,'超出运行时公布的数量预算');continue;}
    for(const item of list){
      if(!record(item)||!text(item.id,128)){add('invalid-item',`plan.${group}`,'缺少有效标识');continue;}
      if(ids[group].has(item.id))add('duplicate-id',`plan.${group}.${item.id}`,'标识重复');
      ids[group].add(item.id);
    }
  }
  if(problems.some(p=>p.code==='budget-exceeded'))return problems;
  const assets=Array.isArray(input.assets)?input.assets:[];
  for(const asset of assets){
    if(!record(asset))continue;
    exact(asset,['id','role','resourceId'],'plan.assets',problems);
    if(!['reference','subject','background','texture'].includes(String(asset.role)))add('invalid-role','plan.assets','素材用途无效');
    if(asset.role==='reference')continue;
    const registered=typeof asset.resourceId==='string'?context.assets.get(asset.resourceId):undefined;
    if(!registered||!registered.local||!registered.usable||registered.referenceOnly||!Array.isArray(registered.allowedRoles)||!registered.allowedRoles.includes(asset.role as AssetUse['role'])||!text(registered.provenanceReceiptId,256)||!/^sha256:[a-f0-9]{64}$/.test(registered.sha256)||!Number.isSafeInteger(registered.bytes)||registered.bytes<=0||!text(registered.mediaType,128)||!['user','search','generated'].includes(registered.origin))add('asset-not-admitted',`plan.assets.${String(asset.id)}`,'作品素材缺少运行时核验的本地资源、用途许可或来源依据');
  }
  let totalBytes=0;
  for(const program of Array.isArray(input.programs)?input.programs:[]){
    if(!record(program))continue;
    exact(program,['id','backend','language','source'],'plan.programs',problems);
    const backend=typeof program.backend==='string'?context.capabilities.backends.get(program.backend):undefined;
    if(!backend||!backend.isolated||!Number.isSafeInteger(backend.maxSourceBytes)||backend.maxSourceBytes<0||!backend.languages.includes(String(program.language)))add('backend-unavailable',`plan.programs.${String(program.id)}`,'后端、语言或有效隔离不可用');
    if(!text(program.source,256*1024)){add('invalid-source','plan.programs.source','程序源无效或过大');continue;}
    const bytes=new TextEncoder().encode(program.source).length;totalBytes+=bytes;
    if(backend&&bytes>backend.maxSourceBytes)add('budget-exceeded','plan.programs.source','程序超过后端字节预算');
  }
  if(totalBytes>context.capabilities.budget.maxProgramBytes)add('budget-exceeded','plan.programs','超出程序总字节预算');
  for(const layer of Array.isArray(input.layers)?input.layers:[]){
    if(!record(layer))continue;
    exact(layer,['id','target','programId','assetId','animated','staticProgramId'],'plan.layers',problems);
    const path=`plan.layers.${String(layer.id)}`;
    if(!context.capabilities.regions.includes(String(layer.target)))add('region-unavailable',path,'宿主未公布此目标区域');
    if(typeof layer.animated!=='boolean')add('invalid-animation',path,'必须明确静态或动态');
    if(!layer.programId&&!layer.assetId)add('missing-implementation',path,'图层需要程序或素材引用');
    if(layer.programId&&!ids.programs.has(String(layer.programId)))add('missing-program',path,'程序引用不存在');
    if(layer.assetId){
      const asset=assets.find(a=>record(a)&&a.id===layer.assetId);
      if(!record(asset)||asset.role==='reference')add('invalid-asset-use',path,'图层素材不存在或仅获准作参考');
    }
    if(layer.animated&&(!layer.staticProgramId||!ids.programs.has(String(layer.staticProgramId))))add('missing-static-fallback',path,'动态图层缺少可编辑的静态回退程序');
  }
  for(const asset of assets)if(record(asset)&&asset.role!=='reference'&&!(Array.isArray(input.layers)&&input.layers.some(layer=>record(layer)&&layer.assetId===asset.id)))add('unused-production-asset',`plan.assets.${String(asset.id)}`,'作品素材必须被至少一个图层引用；未使用的素材应保留为候选');
  const decisions=record(input.decisions)?input.decisions:{};
  exact(decisions,DESIGN_AREAS,'plan.decisions',problems);
  const covered=new Set<string>();
  for(const area of DESIGN_AREAS){
    const decision=decisions[area],path=`plan.decisions.${area}`;
    if(!record(decision)||!text(decision.decision)||!strings(decision.implementationRefs)||!decision.implementationRefs.length||!strings(decision.verification)||!decision.verification.length||!strings(decision.requirementIds)){
      add('incomplete-design',path,'每项职责需要设计决定、实现引用、检查方法及要求关联');continue;
    }
    exact(decision,['decision','implementationRefs','verification','requirementIds'],path,problems);
    for(const id of decision.requirementIds){if(!requirementIds.has(id))add('missing-requirement',path,'要求引用不存在');else covered.add(id);}
    for(const ref of decision.implementationRefs){
      const colon=ref.indexOf(':'),kind=ref.slice(0,colon),id=ref.slice(colon+1);
      const valid=kind==='config'?['theme','font','appearance','workspace','wallpaper','glass','effects'].includes(id):kind==='layer'?ids.layers.has(id):kind==='asset'?ids.assets.has(id):kind==='program'?ids.programs.has(id):false;
      if(!valid)add('missing-implementation',path,`实现引用无效：${ref}`);
    }
  }
  for(const id of requirementIds)if(!covered.has(id))add('uncovered-requirement','plan.requirements',`要求尚未关联设计决定：${id}`);
  if(!context.capabilities.renderAvailable)add('render-unavailable','capabilities.renderAvailable','缺少实际渲染能力，不能宣称完成主题创作');
  return problems;
}

function canonical(value:unknown,depth=0):string{
  if(depth>32)throw new Error('设计文档嵌套过深');
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(v=>canonical(v,depth+1)).join(',')+']';
  if(record(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],depth+1)).join(',')+'}';
  throw new Error('设计文档必须是有限 JSON 数据');
}
export async function designDigest(document:unknown):Promise<string>{
  const bytes=new TextEncoder().encode(canonical(document));
  return 'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/** Evidence identifiers are looked up in a host-owned registry, never trusted inline. */
export async function assessDesign(plan:unknown,receiptIds:readonly string[],context:GateContext):Promise<DesignAssessment>{
  const problems=inspectDesignPlan(plan,context);
  let digest:string;
  try{digest=await designDigest(plan);}catch{return {documentDigest:'',problems:[...problems,{code:'invalid-json',path:'plan',message:'设计文档必须为有界的有限 JSON 数据'}],previewReady:false,applyReady:false,review:'pending'};}
  const evidence:RuntimeEvidence[]=[];
  if(!text(context.activeInspectionId,128))problems.push({code:'invalid-inspection',path:'inspection',message:'缺少运行时指定的有效检查批次'});
  for(const id of new Set(receiptIds)){
    const receipt=context.evidence.get(id);
    if(!receipt||receipt.inspectionId!==context.activeInspectionId||receipt.documentDigest!==digest||receipt.baseVersion!==context.currentBaseVersion||receipt.capabilityRevision!==context.capabilities.revision)problems.push({code:'invalid-evidence',path:`evidence.${id}`,message:'检查回执不存在或已过期'});
  }
  // The caller may cite evidence, but only the host chooses the active batch.
  // Inspect every report in that batch, including failures the caller omits.
  for(const receipt of context.evidence.values())if(receipt.inspectionId===context.activeInspectionId){
    if(receipt.documentDigest!==digest||receipt.baseVersion!==context.currentBaseVersion||receipt.capabilityRevision!==context.capabilities.revision){problems.push({code:'invalid-evidence',path:`evidence.${receipt.id}`,message:'有效检查批次包含过期回执'});continue;}
    evidence.push(receipt);
  }
  const technical=evidence.filter(r=>r.kind==='technical');
  if(technical.some(r=>r.status!=='pass'))problems.push({code:'technical-not-passed',path:'checks',message:'存在失败或未完成的技术报告'});
  for(const check of TECHNICAL_CHECKS){
    const statuses=technical.map(r=>r.checks?.[check]).filter(Boolean);
    const canSkip=record(plan)&&(check==='programIsolation'&&Array.isArray(plan.programs)&&!plan.programs.length||check==='resources'&&Array.isArray(plan.assets)&&plan.assets.every(a=>record(a)&&a.role==='reference'));
    if(!statuses.length||statuses.some(s=>s!=='pass'&&!(s==='not-applicable'&&canSkip)))problems.push({code:'technical-not-passed',path:`checks.${check}`,message:'硬检查缺失、失败或仍未确定'});
  }
  const requirements=record(plan)&&Array.isArray(plan.requirements)?plan.requirements.filter(record):[];
  const visual=evidence.filter(r=>r.kind==='visual');
  const visualPassed=visual.length>0&&visual.every(r=>r.status==='pass')&&requirements.every(req=>{const statuses=visual.map(r=>r.requirements?.[String(req.id)]).filter(Boolean);return statuses.length>0&&statuses.every(s=>s==='pass');});
  const humanApproved=evidence.some(r=>r.kind==='user-approval'&&r.status==='pass')&&!evidence.some(r=>r.kind==='user-approval'&&r.status==='fail');
  const manualApproved=humanApproved&&evidence.some(r=>r.kind==='user-approval'&&r.status==='pass'&&r.reviewMode==='manual');
  const review=manualApproved?'human-verified':visualPassed?'verified':!context.capabilities.visualReviewAvailable?(humanApproved?'human-verified':'human-required'):'pending';
  const previewReady=problems.length===0;
  return {documentDigest:digest,problems,previewReady,applyReady:previewReady&&humanApproved&&(visualPassed||!context.capabilities.visualReviewAvailable||manualApproved),review};
}

export interface RepairBudget { requestId:string; used:number; limit:3 }
export function consumeRepair(budget:RepairBudget,requestId:string):RepairBudget{
  if(budget.limit!==3)throw new Error('自动修正上限由运行时固定为三轮');
  if(requestId!==budget.requestId)throw new Error('内部重试不能切换用户请求以重置修正预算');
  if(!Number.isInteger(budget.used)||budget.used<0||budget.used>=budget.limit)throw new Error('三轮自动修正预算已用尽，保留有效草稿并等待用户反馈');
  return {...budget,used:budget.used+1};
}
