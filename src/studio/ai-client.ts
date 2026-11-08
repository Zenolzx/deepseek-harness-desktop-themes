import { AI_CHANNEL, AI_API_PREFIX } from './ai-contract.ts';
export interface AiTransport { call<T>(endpoint:string,payload:unknown,signal?:AbortSignal):Promise<T> }
export function createAiTransport(connection:unknown):AiTransport {
  return {async call<T>(endpoint:string,payload:unknown,signal?:AbortSignal):Promise<T>{
    if(signal?.aborted)throw signal.reason ?? new DOMException('已取消生成','AbortError');
    const rpc=(connection as {rpc?:{call(channel:string,endpoint:string,payload:unknown,signal?:AbortSignal):Promise<{ok:boolean;value?:unknown;error?:{message:string}}>}}|undefined)?.rpc;
    if(!rpc?.call)throw new Error('当前 DSH 版本未提供 AI 连接通道，请升级宿主后重试。');
    let result;
    try { result=await rpc.call('/api',`${AI_API_PREFIX}/${endpoint}`,payload,signal); }
    catch(error) {
      // Older hosts expose custom RPC channels but not Connection Fetch routes.
      if(signal?.aborted || !/HTTP (404|405)\b/.test(error instanceof Error?error.message:String(error)))throw error;
      result=await rpc.call(AI_CHANNEL,endpoint,payload,signal);
    }
    if(!result.ok)throw new Error(result.error?.message ?? 'AI 服务不可用，请确认宿主已启用模型与默认模型服务。');
    return result.value as T;
  }};
}
