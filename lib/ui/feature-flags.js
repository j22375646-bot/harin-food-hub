'use strict';

function booleanFlag(value, fallback = true) {
  const normalized=String(value ?? '').trim().toLowerCase();
  if(!normalized)return fallback;
  if(['1','true','yes','on'].includes(normalized))return true;
  if(['0','false','no','off'].includes(normalized))return false;
  return fallback;
}

function harinUiConfig(env = process.env) {
  const v8Enabled=booleanFlag(env.HARIN_V8_ENABLED,true);
  return {
    version:v8Enabled?'v8':'classic',
    bodyClass:v8Enabled?'harinV8':'harinClassic',
    v8Enabled,
    rollbackFlag:'HARIN_V8_ENABLED'
  };
}

module.exports={ booleanFlag, harinUiConfig };
