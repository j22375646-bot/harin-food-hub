'use strict';

const SNAPSHOT_VERSION=1;
const NAVIGATION_SNAPSHOT_KEY='harin-hub:navigation-operation-snapshot';
const REFRESH_AFTER_MS=10*60*1000;
const DISPLAY_MAX_AGE_MS=24*60*60*1000;
const MAX_AGE_MS=DISPLAY_MAX_AGE_MS;
const READY_CONNECTION_STATUSES=new Set(['READ_READY','WRITE_READY']);

function countOrNull(value) {
  if(value===null||value===undefined||value==='')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>=0?Math.floor(parsed):null;
}

function buildNavigationOperationSnapshot(data={}) {
  // Page-specific loaders intentionally return only the data required by that
  // page. Only Main owns the complete cross-page operating summary, so a
  // route such as Inventory or Keywords must never replace sidebar counts.
  if(data.loadedView!=='main')return null;
  const channels=Array.isArray(data.channelConnections?.channels)?data.channelConnections.channels:[];
  const readyChannels=channels.filter(item=>READY_CONNECTION_STATUSES.has(String(item?.status||''))).length;
  const totalChannels=channels.length===3?3:null;
  const alerts=Array.isArray(data.alerts)?data.alerts:null;
  const badges={
    orders:countOrNull(data.unifiedOrders?.summary?.actionRequired),
    cs:countOrNull(data.customerService?.summary?.active),
    inventory:countOrNull(data.unifiedInventory?.summary?.action_required),
    notifications:alerts?alerts.filter(item=>!item?.status||String(item.status).toUpperCase()==='OPEN').length:null
  };
  return {
    version:SNAPSHOT_VERSION,
    source:'MAIN_OPERATION_SUMMARY',
    generatedAt:String(data.generatedAt||new Date().toISOString()),
    badges,
    connection:{
      ready:totalChannels===null?null:readyChannels,
      total:totalChannels,
      label:totalChannels===null?'연결 상태 확인':readyChannels===3?'3개 채널 연결':`${readyChannels}/3 채널 연결`,
      tone:totalChannels!==null&&readyChannels===3?'ready':'check'
    }
  };
}

function snapshotTime(snapshot) {
  const timestamp=Date.parse(snapshot?.generatedAt||'');
  return Number.isFinite(timestamp)?timestamp:0;
}

function isNavigationOperationSnapshot(value,now=Date.now(),maxAgeMs=MAX_AGE_MS) {
  if(!value||value.version!==SNAPSHOT_VERSION||value.source!=='MAIN_OPERATION_SUMMARY')return false;
  if(!value.badges||!value.connection)return false;
  const timestamp=snapshotTime(value);
  return timestamp>0&&timestamp<=now+60*1000&&now-timestamp<=maxAgeMs;
}

function navigationOperationSnapshotFreshness(value,now=Date.now()) {
  const timestamp=snapshotTime(value);
  const ageMs=timestamp>0?Math.max(0,now-timestamp):Number.POSITIVE_INFINITY;
  return {ageMs,stale:ageMs>REFRESH_AFTER_MS,expired:ageMs>DISPLAY_MAX_AGE_MS};
}

function parseNavigationOperationSnapshot(raw,now=Date.now(),maxAgeMs=MAX_AGE_MS) {
  try{
    const value=typeof raw==='string'?JSON.parse(raw):raw;
    return isNavigationOperationSnapshot(value,now,maxAgeMs)?value:null;
  }catch{return null;}
}

function selectNavigationOperationSnapshot(...values) {
  return values.filter(Boolean).sort((left,right)=>snapshotTime(right)-snapshotTime(left))[0]||null;
}

module.exports={
  SNAPSHOT_VERSION,NAVIGATION_SNAPSHOT_KEY,MAX_AGE_MS,REFRESH_AFTER_MS,DISPLAY_MAX_AGE_MS,buildNavigationOperationSnapshot,
  isNavigationOperationSnapshot,parseNavigationOperationSnapshot,selectNavigationOperationSnapshot,
  navigationOperationSnapshotFreshness
};
