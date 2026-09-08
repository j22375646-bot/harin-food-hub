'use strict';

// UI freshness guard only. Never use this in place of server membership checks.
function validTenant(value){
 return typeof value==='string'&&value.length>0&&value.length<=256&&value===value.trim();
}
function mayApplyResult(current,meta){
 return Boolean(current&&meta&&validTenant(current.activeTenantId)
  &&validTenant(meta.tenantId)&&current.activeTenantId===meta.tenantId
  &&Number.isSafeInteger(current.requestGeneration)&&current.requestGeneration>0
  &&current.requestGeneration===meta.requestGeneration);
}
function createSwitchState(){
 let activeTenantId=null,requestGeneration=0,controller=null;
 function transition(tenantId){
  if(requestGeneration===Number.MAX_SAFE_INTEGER)throw Error('GENERATION_EXHAUSTED');
  const previous=controller;
  activeTenantId=tenantId;requestGeneration+=1;
  controller=tenantId===null?null:new AbortController();
  // Publish the new state before abort listeners can run synchronously.
  previous?.abort();
 }
 return Object.freeze({
  select(tenantId){if(!validTenant(tenantId))throw Error('INVALID_TENANT');transition(tenantId);},
  clear(){transition(null);},
  capture(){
   if(activeTenantId===null)throw Error('NO_ACTIVE_TENANT');
   return Object.freeze({tenantId:activeTenantId,requestGeneration,signal:controller.signal});
  },
  accepts(meta){return mayApplyResult({activeTenantId,requestGeneration},meta);},
 });
}
module.exports={mayApplyResult,createSwitchState};
