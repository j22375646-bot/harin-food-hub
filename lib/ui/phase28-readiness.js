'use strict';

const {validatePhase28Registry}=require('./phase28-route-registry.js');
const {phase28UiConfig}=require('./feature-flags.js');

function normalizePath(value){
  return String(value||'/').split('?')[0].replace(/\/+$/,'')||'/';
}

function buildPhase28Readiness({routes,hubNav,hubWorkspaces,env={},availableAdapters=[]}){
  const blockers=[];
  for(const issue of validatePhase28Registry(routes))blockers.push({...issue,scope:'registry'});
  const productionPaths=new Set([
    ...hubNav.map(item=>normalizePath(item.href)),
    ...Object.values(hubWorkspaces).flat().map(item=>normalizePath(item.href))
  ]);
  const adapters=new Set(availableAdapters);
  for(const route of routes){
    if(!productionPaths.has(normalizePath(route.href)))blockers.push({code:'MISSING_PRODUCTION_ROUTE',page:route.id,href:route.href});
    if(!adapters.has(route.adapterId))blockers.push({code:'MISSING_ADAPTER',page:route.id,adapterId:route.adapterId});
  }
  const flags=phase28UiConfig(env);
  for(const page of flags.invalidPages)blockers.push({code:'INVALID_FLAG_PAGE',page});
  const registryBlocked=blockers.some(item=>item.scope==='registry');
  return Object.freeze({
    foundation:registryBlocked?'BLOCKED':'READY',
    cutover:blockers.length||!flags.enabled?'BLOCKED':'READY',
    flags:Object.freeze({enabled:flags.enabled,pages:Object.freeze([...flags.pages]),valid:flags.valid}),
    blockers:Object.freeze(blockers)
  });
}

module.exports={buildPhase28Readiness};
