'use strict';

const BRAND_PALETTE=Object.freeze({
  canvas:'#F4F6F8',
  surface:'#FFFFFF',
  ink:'#26313D',
  body:'#3D4A57',
  actionStrong:'#365A78',
  actionSoft:'#E7EFF7',
  selectionStrong:'#665A91',
  selectionSoft:'#EEEAF8',
  analysisStrong:'#3F6865',
  analysisSoft:'#E4F0EE',
  infoStrong:'#3D6975',
  infoSoft:'#E5F0F2',
  successStrong:'#2D6651',
  successSoft:'#E7F2EC',
  warningStrong:'#73531D',
  warningSoft:'#FAF1DA',
  dangerStrong:'#8A3F49',
  dangerSoft:'#FBEAEC',
  neutralStrong:'#525F6C',
  neutralSoft:'#EEF1F4'
});

const STATUS_TONES=Object.freeze({
  success:new Set(['READY','READ_READY','WRITE_READY','SUCCESS','CONNECTED','COMPLETE','COMPLETED','HEALTHY','ONLINE']),
  warning:new Set(['PARTIAL','STALE','CHECK','CHECK_REQUIRED','SETUP_REQUIRED','RETRY','PENDING','DELAYED']),
  danger:new Set(['FAILED','FAILURE','ERROR','BLOCKED','CRITICAL','OFFLINE']),
  info:new Set(['RUNNING','SYNCING','PROCESSING','COLLECTING','QUEUED'])
});

const PAGE_TONES=Object.freeze({
  today:Object.freeze({ink:'#665A91',soft:'#EEEAF8',active:'#DED8EE',line:'#DED8EE'}),
  orders:Object.freeze({ink:'#3D6975',soft:'#E5F0F2',active:'#D2E4E8',line:'#D2E4E8'}),
  customer:Object.freeze({ink:'#79505D',soft:'#F6E9ED',active:'#EAD4DA',line:'#EAD4DA'}),
  inventory:Object.freeze({ink:'#7D5736',soft:'#F8ECDF',active:'#EED9C6',line:'#EED9C6'}),
  settlement:Object.freeze({ink:'#6E5D28',soft:'#F7F0D8',active:'#E9DDB5',line:'#E9DDB5'}),
  analysis:Object.freeze({ink:'#3F6865',soft:'#E4F0EE',active:'#D1E3DF',line:'#D1E3DF'}),
  development:Object.freeze({ink:'#5D5B82',soft:'#ECEBF4',active:'#DCD9EA',line:'#DCD9EA'}),
  system:Object.freeze({ink:'#525F6C',soft:'#EEF1F4',active:'#DDE3EA',line:'#DDE3EA'})
});

const VIEW_PAGE_TONES=Object.freeze({
  main:'today',
  orders:'orders',
  cs:'customer',
  inventory:'inventory',
  product:'inventory',
  settlement:'settlement',
  insight:'analysis',
  keyword:'analysis',
  reports:'analysis',
  market:'development',
  validation:'development',
  experiments:'development',
  collection:'system',
  changes:'system',
  notifications:'system',
  knowledge:'system'
});

function normalizeStatus(value){
  return String(value||'').trim().replace(/[\s-]+/g,'_').toUpperCase();
}

function resolveStatusTone(value,fallback='neutral'){
  const normalized=normalizeStatus(value);
  for(const [tone,values] of Object.entries(STATUS_TONES))if(values.has(normalized))return tone;
  return fallback;
}

function resolvePageTone(value){
  const normalized=String(value||'').trim().toLowerCase();
  if(PAGE_TONES[normalized])return normalized;
  return VIEW_PAGE_TONES[normalized]||'today';
}

module.exports={BRAND_PALETTE,STATUS_TONES,PAGE_TONES,VIEW_PAGE_TONES,normalizeStatus,resolveStatusTone,resolvePageTone};
