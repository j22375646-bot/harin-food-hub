'use strict';

const {PHASE28_ROUTE_IDS}=require('./phase28-route-registry.js');

function booleanFlag(value, fallback = true) {
  const normalized=String(value ?? '').trim().toLowerCase();
  if(!normalized)return fallback;
  if(['1','true','yes','on'].includes(normalized))return true;
  if(['0','false','no','off'].includes(normalized))return false;
  return fallback;
}

function listFlag(value) {
  return [...new Set(String(value || '').split(',').map(item=>item.trim()).filter(Boolean))];
}

function phase28UiConfig(env = process.env) {
  const enabled=booleanFlag(env.HARIN_PHASE28_ENABLED,false);
  const requested=listFlag(env.HARIN_PHASE28_PAGES);
  const allowed=new Set(PHASE28_ROUTE_IDS);
  const invalidPages=requested.filter(id=>!allowed.has(id));
  const valid=invalidPages.length===0;
  const pages=valid?requested:[];
  const complete=valid&&PHASE28_ROUTE_IDS.every(id=>pages.includes(id));
  const coverage=complete?'COMPLETE':pages.length?'PARTIAL':'EMPTY';
  return {
    enabled,
    pages,
    invalidPages,
    valid,
    complete,
    coverage,
    active:id=>enabled&&complete&&pages.includes(id),
    rollbackFlag:'HARIN_PHASE28_ENABLED',
    pagesFlag:'HARIN_PHASE28_PAGES'
  };
}

function phase28RuntimeConfig(env = process.env, {readiness={cutover:'BLOCKED'},routeId=null} = {}) {
  const config=phase28UiConfig(env);
  const full=config.enabled&&config.complete&&readiness.cutover==='READY';
  const preview=booleanFlag(env.HARIN_PHASE28_PREVIEW,false)
    &&env.NODE_ENV==='development'
    &&config.valid
    &&Boolean(routeId)
    &&config.pages.includes(routeId);
  const renderMode=full?'full':preview?'preview':'legacy';
  const activePages=full?[...PHASE28_ROUTE_IDS]:preview?[routeId]:[];
  return Object.freeze({
    enabled:config.enabled,
    valid:config.valid,
    pages:Object.freeze([...config.pages]),
    invalidPages:Object.freeze([...config.invalidPages]),
    coverage:config.coverage,
    renderMode,
    activePages:Object.freeze(activePages),
    routeId
  });
}

function harinUiConfig(env = process.env) {
  const v8Enabled=booleanFlag(env.HARIN_V8_ENABLED,true);
  return {
    version:v8Enabled?'v8':'classic',
    bodyClass:v8Enabled?'harinV8':'harinClassic',
    v8Enabled,
    rollbackFlag:'HARIN_V8_ENABLED',
    phase28:phase28UiConfig(env)
  };
}

module.exports={ booleanFlag, listFlag, phase28UiConfig, phase28RuntimeConfig, harinUiConfig };
