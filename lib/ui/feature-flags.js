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
  return {
    enabled,
    pages,
    invalidPages,
    valid,
    active:id=>enabled&&valid&&pages.includes(id),
    rollbackFlag:'HARIN_PHASE28_ENABLED',
    pagesFlag:'HARIN_PHASE28_PAGES'
  };
}

function phase28RuntimeConfig(env = process.env) {
  const config=phase28UiConfig(env);
  return Object.freeze({
    enabled:config.enabled,
    valid:config.valid,
    pages:Object.freeze([...config.pages]),
    activePages:Object.freeze(config.enabled&&config.valid?[...config.pages]:[]),
    invalidPages:Object.freeze([...config.invalidPages])
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
