import type { DesignMessage, DesignSnapshot, ModelChoice, ReferenceImage } from './ai-contract.ts';
export interface DesignVersion { id:string; parent?:string; title:string; snapshot:DesignSnapshot; messages:DesignMessage[] }
export interface DesignSession {
  id:'active'; version:1; messages:DesignMessage[]; versions:DesignVersion[]; selected:string;
  images:ReferenceImage[]; input:string; redesign:boolean; model?:ModelChoice; ownedWallpapers:string[];
  working?:DesignSnapshot;
}
let pending:Promise<unknown>=Promise.resolve();
function transact<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T|undefined>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('本地会话存储不可用'));return;}
    const opening=indexedDB.open('dsh-desktop-themes-ai',1);
    opening.onupgradeneeded=()=>opening.result.createObjectStore('sessions',{keyPath:'id'});
    opening.onerror=()=>reject(new Error('无法打开设计会话存储'));
    opening.onsuccess=()=>{
      const db=opening.result,tx=db.transaction('sessions',mode),request=operation(tx.objectStore('sessions'));
      let result:T|undefined;
      request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>{db.close();resolve(result);};
      tx.onerror=tx.onabort=()=>{db.close();reject(new Error('设计会话保存失败，请检查可用空间'));};
    };
  });
}
export function loadDesignSession():Promise<DesignSession|undefined>{
  return pending.then(()=>transact('readonly',store=>store.get('active'))).then(value=>{
    if(!value)return undefined;
    const session=value as DesignSession;
    if(session.version!==1||!Array.isArray(session.versions)||!session.versions.length||!Array.isArray(session.images)||!Array.isArray(session.messages)||!session.versions.some(v=>v.id===session.selected))throw new Error('本地设计会话损坏，请删除后重新设计');
    return session;
  });
}
export function saveDesignSession(session:DesignSession):Promise<unknown>{
  const copy=structuredClone(session);
  pending=pending.catch(()=>undefined).then(()=>transact('readwrite',store=>store.put(copy)));
  return pending;
}
export function deleteDesignSession():Promise<unknown>{
  pending=pending.catch(()=>undefined).then(()=>transact('readwrite',store=>store.delete('active')));
  return pending;
}
