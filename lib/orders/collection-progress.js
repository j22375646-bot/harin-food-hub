'use strict';

const PLATFORM_ORDER=Object.freeze(['NAVER','CAFE24','COUPANG']);
const PLATFORM_LABELS=Object.freeze({NAVER:'네이버',CAFE24:'Cafe24',COUPANG:'쿠팡'});
const ACTIVE_STATUSES=new Set(['PENDING','QUEUED','RUNNING']);

function statusOf(value){
  if(value&&typeof value==='object')return String(value.status||'').toUpperCase();
  return String(value||'').toUpperCase();
}

function activeCollectionPlatforms(progress={}){
  const byPlatform={NAVER:progress.naver,CAFE24:progress.cafe24,COUPANG:progress.coupang};
  return PLATFORM_ORDER.filter(platform=>ACTIVE_STATUSES.has(statusOf(byPlatform[platform])));
}

function collectionProgressLabel(platforms=[]){
  const labels=platforms.map(platform=>PLATFORM_LABELS[String(platform||'').toUpperCase()]).filter(Boolean);
  return labels.length?`${labels.join(' · ')} 수집 중`:'1시간 자동';
}

module.exports={activeCollectionPlatforms,collectionProgressLabel};
