import type { Artwork, ArtworkAsset } from './artwork.ts';
let queue:Promise<unknown>=Promise.resolve();
function operation<T>(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open('dsh-artwork-assets',1);open.onupgradeneeded=()=>open.result.createObjectStore('assets');open.onerror=()=>reject(new Error('素材存储不可用'));
    open.onsuccess=()=>{const db=open.result,tx=db.transaction('assets',mode),request=fn(tx.objectStore('assets'));let result:T;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=tx.onerror=()=>{db.close();reject(new Error('素材存储失败'));};};
  });
}
export async function resolveArtworkAsset(asset:ArtworkAsset):Promise<string>{
  const data=asset.data ?? await operation<string|undefined>('readonly',s=>s.get(asset.sha256));if(!data)throw new Error(`作品素材缺失：${asset.name}`);
  if(await dataDigest(data)!==asset.sha256)throw new Error(`素材哈希不符：${asset.name}`);return data;
}
async function dataDigest(data:string):Promise<string>{const bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));return 'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function persistArtwork(art:Artwork):Promise<{artwork:Artwork;created:string[]}>{
  const artwork=structuredClone(art),created:string[]=[];
  for(const asset of artwork.assets){
    if(asset.data){
      const bytes=Uint8Array.from(atob(asset.data.split(',')[1]),c=>c.charCodeAt(0));
      const digest=await dataDigest(asset.data);
      if(digest!==asset.sha256)throw new Error(`素材哈希不符：${asset.name}`);
      const bitmap=await createImageBitmap(new Blob([bytes]));const pixels=bitmap.width*bitmap.height;bitmap.close();if(pixels>16_000_000)throw new Error('作品素材像素量过大');
      const existing=await operation<string|undefined>('readonly',s=>s.get(asset.sha256));
      if(existing!==asset.data){const data=asset.data;queue=queue.catch(()=>undefined).then(()=>operation('readwrite',s=>s.put(data,asset.sha256)));await queue;if(!existing)created.push(asset.sha256);}
      delete asset.data;
    }else await resolveArtworkAsset(asset);
  }
  return {artwork,created};
}
export async function embedArtworkAssets(art:Artwork):Promise<Artwork>{const result=structuredClone(art);for(const a of result.assets)a.data=await resolveArtworkAsset(a);return result;}
export async function removeArtworkAsset(hash:string){await operation('readwrite',s=>s.delete(hash));}
