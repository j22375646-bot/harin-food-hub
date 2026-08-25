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

function normalizeStatus(value){
  return String(value||'').trim().replace(/[\s-]+/g,'_').toUpperCase();
}

function resolveStatusTone(value,fallback='neutral'){
  const normalized=normalizeStatus(value);
  for(const [tone,values] of Object.entries(STATUS_TONES))if(values.has(normalized))return tone;
  return fallback;
}

module.exports={BRAND_PALETTE,STATUS_TONES,normalizeStatus,resolveStatusTone};
