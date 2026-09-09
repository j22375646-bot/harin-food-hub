'use strict';

const {buildPhase28SettlementModel}=require('../ui/phase28-adapters/settlement.js');
const PLATFORMS=Object.freeze(['CAFE24','NAVER','COUPANG','COUPANG_RG']);
const LABELS=Object.freeze({CAFE24:'Cafe24',NAVER:'네이버',COUPANG:'쿠팡 판매자배송',COUPANG_RG:'쿠팡 로켓그로스'});
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const text=value=>typeof value==='string'?value.slice(0,500):null;

// Projection only: the web settlement model owns calculations and evidence rules.
// No raw ledgers, account details, recovery URLs, or writes cross this boundary.
function buildWorkspaceSettlementSummary(data={},days=30){
 if(!Number.isInteger(days)||![7,30,90].includes(days))throw RangeError('Unsupported settlement period');
 const period=buildPhase28SettlementModel(data).periods[String(days)];
 if(!period)throw RangeError('Settlement period unavailable');
 const rows=new Map();
 for(const row of period.channels){
  if(!PLATFORMS.includes(row.platform)||rows.has(row.platform))throw TypeError('Invalid settlement channel');
  rows.set(row.platform,row);
 }
 const channels=PLATFORMS.map(platform=>{
  const row=rows.get(platform)||{};
  return {platform,label:LABELS[platform],stateCode:row.stateCode||'NO_DATA',stateLabel:row.stateLabel||'자료 확인 필요',
   gross:number(row.gross),refunds:number(row.refunds),fees:number(row.fees),logistics:number(row.logistics),advertising:number(row.advertising),
   expected:number(row.expected),actual:number(row.actual),pending:number(row.pendingPayout),variance:number(row.variance),
   basis:text(row.basis),payoutBasis:text(row.payoutBasis),asOf:timestamp(row.asOf)};
 });
 const actual=number(period.actual),expected=number(period.expected);
 return {writePolicy:'READ_ONLY',generatedAt:timestamp(data.generatedAt),period:{days,start:timestamp(period.start),end:timestamp(period.end)},
  summary:{actual:{value:actual,status:actual===null?'BLOCKED':period.actualComplete?'READY':'PARTIAL'},
   expected:{value:expected,status:expected===null?'BLOCKED':'ESTIMATED'},
   variance:number(period.variance),comparableChannels:number(period.comparableChannels)},
  channels,schedules:period.schedules.filter(item=>PLATFORMS.includes(item.platform)).slice(0,100).map(item=>({
   platform:item.platform,date:typeof item.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item.date)&&Number.isFinite(Date.parse(item.date))?item.date:null,
   amount:number(item.amount),status:text(item.status),type:text(item.type)}))};
}
module.exports={buildWorkspaceSettlementSummary};
