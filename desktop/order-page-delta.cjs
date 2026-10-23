'use strict';
// Shared wire contract. No credentials, Electron APIs, or persistent cache.
const ID=/^HR-(?:C24|CP|NV)-[A-F0-9]{8}$/;
const HASH=/^[a-f0-9]{64}$/;
const version=row=>require('node:crypto').createHash('sha256').update(JSON.stringify(row)).digest('hex');
function parseKnown(value){
 if(value==='-')return new Map();
 if(typeof value!=='string'||value.length>2048)throw Error('Invalid baseline');
 const entries=value.split('~');if(!entries.length||entries.length>20)throw Error('Invalid baseline size');
 const result=new Map();for(const entry of entries){const parts=entry.split('@');if(parts.length!==2||!ID.test(parts[0])||!HASH.test(parts[1])||result.has(parts[0]))throw Error('Invalid baseline entry');result.set(...parts);}return result;
}
function knownRows(rows){
 if(!Array.isArray(rows)||rows.length>20)throw Error('Invalid rows');
 const value=rows.length?rows.map(row=>`${row.hubOrderId}@${version(row)}`).join('~'):'-';parseKnown(value);return value;
}
function deltaPage(payload,known){
 const baseline=parseKnown(known);
 if(payload?.ok!==true||payload.partial!==false||payload.offset!==0||!Array.isArray(payload.orders)||payload.orders.length>20)throw Error('Incomplete page');
 knownRows(payload.orders);
 const versions=Object.fromEntries(payload.orders.map(row=>[row.hubOrderId,version(row)]));
 return {...payload,deltaContract:1,orderKeys:payload.orders.map(row=>row.hubOrderId),versions,orders:payload.orders.filter(row=>baseline.get(row.hubOrderId)!==versions[row.hubOrderId])};
}
function mergePage(payload,baseline){
 if(payload?.deltaContract!==1||payload.offset!==0||payload.partial!==false||!Array.isArray(payload.orderKeys)||payload.orderKeys.length>20||new Set(payload.orderKeys).size!==payload.orderKeys.length||payload.orderKeys.some(id=>!ID.test(id))||!Array.isArray(payload.orders)||payload.orders.length>20||!payload.versions||Object.keys(payload.versions).length!==payload.orderKeys.length)throw Error('Invalid delta');
 const rows=new Map(baseline.map(row=>[row.hubOrderId,row])),seen=new Set();
 for(const row of payload.orders){if(!payload.orderKeys.includes(row.hubOrderId)||seen.has(row.hubOrderId))throw Error('Unexpected delta row');seen.add(row.hubOrderId);rows.set(row.hubOrderId,row);}
 const orders=payload.orderKeys.map(id=>{const row=rows.get(id);if(!row||!HASH.test(payload.versions[id])||version(row)!==payload.versions[id])throw Error('Missing or changed row');return row;});
 const {deltaContract,orderKeys,versions,...page}=payload;return {...page,orders};
}
module.exports={parseKnown,knownRows,deltaPage,mergePage};
