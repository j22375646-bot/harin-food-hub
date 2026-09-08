import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import unified from '../../../../lib/orders/unified-orders.js';
import adapter from '../../../../lib/ui/phase28-adapters/orders.js';
import calendar from '../../../../lib/calendar/calendar-center.js';
import orderEvents from '../../../../lib/calendar/order-events.js';

const ALLOWED=new Set(['stage','platform','offset','snapshot','delayOnly','giftOnly','query','start','end','format']);
const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function validDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split('-').map(Number);const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;}
function readOptions(params){
  const seen=new Set();for(const [key,value] of params){if(!ALLOWED.has(key)||seen.has(key)||value.length>128)throw Object.assign(Error('올바른 조회 조건을 입력하세요.'),{code:'INVALID_QUERY',status:400});seen.add(key);}
  const query=(params.get('query')||'').trim(),start=params.get('start')||'',end=params.get('end')||'',format=params.get('format')||'';
  if(query.length>100||(start&&!validDate(start))||(end&&!validDate(end))||(start&&end&&start>end)||(format&&!['xlsx'].includes(format)))throw Object.assign(Error('올바른 검색어와 기간을 입력하세요.'),{code:'INVALID_QUERY',status:400});
  return {stage:params.get('stage'),platform:params.get('platform'),offset:params.get('offset'),snapshot:params.get('snapshot'),delayOnly:params.get('delayOnly')==='true',giftOnly:params.get('giftOnly')==='true',query,start,end,format};
}
const safeCell=value=>typeof value==='string'&&/^[\s\u0000-\u001f\u007f-\u009f]*[=+@-]/u.test(value)?`'${value}`:value;
async function xlsxResponse(candidates,events,snapshot){
  if(candidates.length===0)return apiSafety.json({ok:false,code:'NO_ORDERS',error:'조건에 맞는 주문이 없어 엑셀 파일을 만들지 않았습니다.'},{status:404,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  if(candidates.length>5000)return apiSafety.json({ok:false,code:'EXPORT_LIMIT_EXCEEDED',error:'엑셀 저장은 최대 5,000건까지 가능합니다. 기간을 줄여주세요.'},{status:413,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  const ExcelJS=(await import('exceljs')).default;const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('주문');
  sheet.columns=[['주문번호','externalOrderId'],['상품','productName'],['채널','channelLabel'],['상태','stageLabel'],['수량','quantity'],['금액','amount'],['주문일','orderedAt'],['송장번호','invoiceNumber']].map(([header,key])=>({header,key,width:key==='productName'?36:18}));
  for(const row of adapter.exportOrderRows(candidates,events))sheet.addRow({...row,externalOrderId:safeCell(row.externalOrderId),productName:safeCell(row.productName),channelLabel:safeCell(row.channelLabel),stageLabel:safeCell(row.stageLabel),orderedAt:safeCell(row.orderedAt),invoiceNumber:safeCell(row.invoiceNumber)});
  const output=await workbook.xlsx.writeBuffer();
  return new Response(output,{status:200,headers:{'Content-Type':XLSX_MIME,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent('모아온_주문.xlsx')}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Moaon-Search-Contract':'1','X-Moaon-Export-Count':String(candidates.length),'X-Moaon-Export-Snapshot':snapshot}});
}

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const params=new URL(request.url).searchParams;
    const options=readOptions(params);
    const db=supabaseModule.getSupabase();
    const [center,eventResult]=await Promise.all([unified.loadUnifiedOrders({db}),orderEvents.loadOrderEvents(db)]);
    if(eventResult.error)throw eventResult.error;
    const failedChannels=(center.channels||[]).filter(channel=>channel.status==='FAILED');
    // Stored-row access is not evidence of upstream authentication/readiness.
    // Connector capabilities remain owned by the dashboard shell loader.
    const orderReadStates=(center.channels||[]).map(channel=>({platform:channel.platform,status:channel.status==='FAILED'?'FAILED':'READY',source:'STORED_ORDER_QUERY'}));
    const selectedPlatform=params.get('platform')||'ALL';
    if(failedChannels.some(channel=>channel.platform===selectedPlatform)||failedChannels.length===3){
      return apiSafety.json({ok:false,code:'CHANNEL_ORDERS_UNAVAILABLE',orderReadStates,error:'선택한 채널을 불러오지 못했습니다. 이전 자료를 유지하며 다시 확인합니다.'},{status:502});
    }
    if(options.format==='xlsx'&&failedChannels.length)return apiSafety.json({ok:false,code:'PARTIAL_EXPORT_BLOCKED',error:'일부 채널을 불러오지 못해 엑셀 저장을 중단했습니다.'},{status:502,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    const events=eventResult.data.map(calendar.decorateEntry);
    const candidates=adapter.orderCandidates(center.orders,events,options);
    if(options.format==='xlsx'){const proof=adapter.buildOrderPage(center.orders,events,{...options,offset:0,snapshot:null});return xlsxResponse(candidates,events,proof.snapshot);}
    const page=adapter.buildOrderPage(center.orders,events,options);
    const summary=adapter.buildPhase28OrdersModel({unifiedOrders:center,calendarEntries:eventResult.data,generatedAt:new Date().toISOString()});
    return apiSafety.json({ok:true,...page,searchContractVersion:1,appliedSearch:{query:options.query,start:options.start,end:options.end},orderReadStates,partial:failedChannels.length>0,warning:failedChannels.length?`${failedChannels.map(channel=>channel.platform).join(', ')} 주문 불러오기 실패 · 정상 채널의 주문은 계속 확인할 수 있습니다.`:null,workspaces:summary.workspaces,hero:summary.hero},{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){
    return apiSafety.json({ok:false,code:error.code,error:error.status===409?error.message:'주문 목록을 불러오지 못했습니다.'},{status:error.status||502,headers:{'Cache-Control':'no-store'}});
  }
}
