import type { DesignResult, DesignSnapshot } from '../studio/ai-contract.ts';
export interface RenderSample {width:number;height:number;phase:number;state:string;frameMs:number;image:string}
export interface Inspection {samples:RenderSample[];roundTrip:boolean;errors:string[]}
export type CreatorReply =
  | {kind:'question';question:string;recommendation:string}
  | {kind:'render';runId:string;nonce:string;digest:string;snapshot:DesignSnapshot}
  | {kind:'complete';result:DesignResult;review:'visual'|'manual';evidence:string[]};
