/** Runs the real client presenter against a minimal official-service adapter. */
import { createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { apply } from '../src/client/index.tsx';
const root=createRoot(document.getElementById('root')!);
const definitions=new Map<string,any>(),overrides=new Map<string,any>(),panels=new Map<string,any>(),cleanups:Array<()=>void>=[];
let active='mint-breeze';
const writes:any[]=[];
const paint=()=>{
  const def=definitions.get(active);if(!def)return;
  for(const [k,v] of Object.entries(def.tokens))document.documentElement.style.setProperty(k,String(v));
  for(const tokens of overrides.values())for(const [k,v] of Object.entries(tokens))document.documentElement.style.setProperty(k,(v as any)[def.colorScheme]);
  document.body.toggleAttribute('data-ds-dark-theme',def.colorScheme==='dark');
  document.documentElement.style.colorScheme=def.colorScheme;
};
const theme={register:(def:any)=>{definitions.set(def.id,def);return()=>definitions.delete(def.id);},setTheme:(id:string)=>{active=id;paint();},getTheme:()=>({active:{id:active,colorScheme:definitions.get(active)?.colorScheme},themes:[...definitions.values()]}),overrideTokens:(id:string,tokens:any)=>{overrides.set(id,tokens);paint();return()=>{overrides.delete(id);paint();};}};
const show=(id:string|null)=>{const component=panels.get(id??'desktop-themes');if(component)root.render(createElement(component as ComponentType<any>,{}));};
const services:any={theme,slots:{inject:(_name:string,fn:()=>void)=>fn(),register:(options:any,component:any)=>{if(options.name==='main'||options.name==='settings.section')panels.set(options.key??options.id,component);return()=>{};}},layout:{selectPanel:show},configForms:{get:()=>({getSnapshot:()=>({status:'unavailable'}),subscribe:()=>()=>{},set:async(field:string,value:any)=>{writes.push({field,value});return true;}})}};
const ctx:any={get:(name:string)=>services[name],inject:(_names:string[],fn:(ctx:any)=>void)=>fn(ctx),effect:(fn:()=>void|(()=>void))=>{const cleanup=fn();if(cleanup)cleanups.push(cleanup);},on:()=>{}};
apply(ctx);show(new URL(location.href).searchParams.has('studio')?'desktop-themes-studio':null);
(window as any).__runtime={writes,show,active:()=>active,dispose:()=>{root.unmount();cleanups.reverse().forEach(fn=>fn());}};
const css=document.createElement('style');css.textContent='html,body,#root{margin:0;height:100%;}body{font:14px system-ui;background-color:#f1efec}';document.head.append(css);
