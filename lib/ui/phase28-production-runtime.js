'use strict';

const featureFlags=require('./feature-flags.js');
const {buildPhase28Readiness}=require('./phase28-readiness.js');
const routes=require('./phase28-route-registry.js');
const hub=require('../navigation/hub-routes.js');
const {PHASE28_AVAILABLE_ADAPTERS}=require('./phase28-adapters/index.js');

const completePageList=routes.PHASE28_ROUTE_IDS.join(',');

function phase28CutoverEnv(env=process.env){
  const enabled=String(env.HARIN_PHASE28_ENABLED??'').trim()
    ?env.HARIN_PHASE28_ENABLED
    :'true';
  const pages=String(env.HARIN_PHASE28_PAGES??'').trim()
    ?env.HARIN_PHASE28_PAGES
    :completePageList;
  return {...env,HARIN_PHASE28_ENABLED:enabled,HARIN_PHASE28_PAGES:pages};
}

function phase28ProductionReadiness(env=process.env){
  const effectiveEnv=phase28CutoverEnv(env);
  return buildPhase28Readiness({
    routes:routes.PHASE28_ROUTES,
    hubNav:hub.HUB_NAV,
    hubWorkspaces:hub.HUB_WORKSPACES,
    env:effectiveEnv,
    availableAdapters:PHASE28_AVAILABLE_ADAPTERS
  });
}

function phase28RuntimeConfig(env=process.env,{routeId=null}={}){
  const effectiveEnv=phase28CutoverEnv(env);
  return featureFlags.phase28RuntimeConfig(effectiveEnv,{
    routeId,
    readiness:phase28ProductionReadiness(effectiveEnv)
  });
}

function phase28RuntimeForState(env=process.env,state={}){
  const effectiveEnv=phase28CutoverEnv(env);
  return featureFlags.phase28RuntimeForState(effectiveEnv,state,{
    readiness:phase28ProductionReadiness(effectiveEnv)
  });
}

module.exports={
  phase28CutoverEnv,
  phase28ProductionReadiness,
  phase28RuntimeConfig,
  phase28RuntimeForState
};
