import { AI_CHANNEL } from './ai-contract.ts';
export interface AiTransport { call<T>(endpoint:string,payload:unknown,signal?:AbortSignal):Promise<T> }
export function createAiTransport(connection:unknown):AiTransport {
  return {async call<T>(endpoint:string,payload:unknown,signal?:AbortSignal):Promise<T>{
    const rpc=(connection as {rpc?:{call(channel:string,endpoint:string,payload:unknown,signal?:AbortSignal):Promise<{ok:boolean;value?:unknown;error?:{message:string}}>}}|undefined)?.rpc;
    if(!rpc?.call)throw new Error('当前 DSH 版本未提供 AI 连接通道，请升级宿主后重试。');
    const result=await rpc.call(AI_CHANNEL,endpoint,payload,signal);
    if(!result.ok)throw new Error(result.error?.message ?? 'AI 服务不可用，请确认宿主已启用模型与默认模型服务。');
    return result.value as T;
  }};
}
