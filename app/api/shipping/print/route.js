import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import cafe24Client from '../../../../lib/cafe24/client.js';
import cafe24Config from '../../../../lib/cafe24/config.js';
import operationQueue from '../../../../lib/coupang/operation-queue.js';
import unifiedOrdersModule from '../../../../lib/orders/unified-orders.js';
import labelModule from '../../../../lib/shipping/label.js';
import channelTransfer from '../../../../lib/shipping/channel-transfer.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const escapeHtml=labelModule.escapeHtml;
const text=value=>value==null?'':String(value).trim();

function receiverFromCafe24(payload={}) {
  return labelModule.normalizeReceiver(payload);
}

async function invoiceHistory(db,orders) {
  const history=await db.from('coupang_operation_requests')
    .select('operation_type,target_type,target_id,status,payload,created_at')
    .in('operation_type',['UPLOAD_INVOICE',channelTransfer.CAFE24_OPERATION])
    .eq('status','SUCCESS').order('created_at',{ascending:false}).limit(500);
  if(history.error)throw history.error;
  const byShipment=new Map(orders.filter(order=>order.platform==='COUPANG').map(order=>[text(order.shipmentId),order.hubOrderId]));
  const latest={};
  for(const row of history.data||[]) {
    const hubOrderId=row.operation_type===channelTransfer.CAFE24_OPERATION?row.target_id:byShipment.get(text(row.target_id));
    if(!hubOrderId||latest[hubOrderId])continue;
    try{latest[hubOrderId]=channelTransfer.postalTracking(operationQueue.open(row.payload)?.invoiceNumber);}catch{}
  }
  return latest;
}

async function receiversForLabels(db,orders) {
  const coupangIds=orders.filter(order=>order.platform==='COUPANG').map(order=>text(order.shipmentId)).filter(Boolean);
  const coupangRaw={};
  if(coupangIds.length){
    const rows=await db.from('coupang_orders').select('shipment_box_id,raw_data').in('shipment_box_id',coupangIds);
    if(rows.error)throw rows.error;
    for(const row of rows.data||[])coupangRaw[text(row.shipment_box_id)]=row.raw_data||{};
  }
  const pairs=await Promise.all(orders.map(async order=>{
    if(order.platform==='CAFE24'){
      try{
        const result=await cafe24Client.adminGet(cafe24Config.getConfig(),`/orders/${encodeURIComponent(order.externalOrderId)}/receivers`);
        return [order.hubOrderId,receiverFromCafe24(result.payload||{})];
      }catch{return [order.hubOrderId,{}];}
    }
    return [order.hubOrderId,labelModule.normalizeReceiver(coupangRaw[order.shipmentId]||{})];
  }));
  return Object.fromEntries(pairs);
}

function standardDocument(type,orders) {
  const title=type==='packing'?'포장명세서':'출고목록';
  const rows=orders.map((order,index)=>`<tr><td>${index+1}</td><td><b>${escapeHtml(order.hubOrderId)}</b><br><small>${escapeHtml(order.channelLabel)} · ${escapeHtml(order.externalOrderId)}</small></td><td>${order.items.map(item=>escapeHtml(`${item.name}${item.option?` (${item.option})`:''} × ${item.quantity}`)).join('<br>')}</td><td>${escapeHtml((order.packagingInstructions||[]).join(' / '))}</td><td class="check">□</td></tr>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>하린식품 ${title}</title><style>@page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#18221e;margin:0}header{display:flex;justify-content:space-between;align-items:end;border-bottom:3px solid #1f684e;padding-bottom:10px;margin-bottom:14px}h1{margin:0;font-size:25px}header p{margin:4px 0 0;color:#64716b;font-size:12px}header b{font-size:12px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}th{background:#eaf3ef;padding:9px 7px;text-align:left}td{border-bottom:1px solid #dce4e0;padding:10px 7px;vertical-align:top;line-height:1.5}th:nth-child(1),td:nth-child(1){width:7%;text-align:center}th:nth-child(2),td:nth-child(2){width:24%}th:nth-child(3),td:nth-child(3){width:31%}th:nth-child(5),td:nth-child(5){width:8%;text-align:center}.check{font-size:20px}small{color:#6d7872}.notice{margin-top:14px;border:1px solid #e4c68e;background:#fff9ec;padding:10px;font-size:10px}.actions{display:flex;gap:8px;margin-bottom:14px}.actions button{border:0;border-radius:8px;background:#1f684e;color:white;padding:9px 13px;font-weight:700}@media print{.actions{display:none}}</style></head><body><div class="actions"><button onclick="window.print()">PDF로 인쇄·저장</button><button onclick="window.close()">닫기</button></div><header><div><h1>하린식품 ${title}</h1><p>선택 주문 ${orders.length}건 · 개인정보를 저장하지 않는 작업용 문서</p></div><b>${escapeHtml(new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</b></header><table><thead><tr><th>순서</th><th>주문</th><th>상품·수량</th><th>포장 지시</th><th>확인</th></tr></thead><tbody>${rows||'<tr><td colspan="5">선택한 주문이 없습니다.</td></tr>'}</tbody></table><p class="notice">묶음배송 후보는 자동 합배송이 아닙니다. 특히 쿠팡 주문은 각 쇼핑몰 정책을 확인한 뒤 처리하세요.</p></body></html>`;
}

function labelDocument(orders,receivers) {
  const pages=orders.map(order=>{
    const receiver=receivers[order.hubOrderId]||{};
    const address=[receiver.postCode&&`(${receiver.postCode})`,receiver.address,receiver.addressDetail].filter(Boolean).join(' ');
    const goods=(order.items||[]).map(item=>`${item.name}${item.option?` · ${item.option}`:''} × ${item.quantity}`).join(' / ');
    return `<article class="label"><header><div><b>우체국택배</b><span>하린식품</span></div><em>${escapeHtml(order.channelLabel)} · ${escapeHtml(order.externalOrderId)}</em></header><section class="receiver"><small>받는 분</small><h1>${escapeHtml(receiver.name||'받는 분 확인 필요')}</h1><strong>${escapeHtml(receiver.contact||'연락처 확인 필요')}</strong><p>${escapeHtml(address||'배송주소 확인 필요')}</p></section><section class="goods"><small>상품</small><b>${escapeHtml(goods||order.productName||'상품명 확인 필요')}</b><span>${escapeHtml(receiver.message||'배송메모 없음')}</span></section><section class="barcode">${labelModule.barcodeSvg(order.invoiceNumber)}<b>${escapeHtml(order.invoiceNumber)}</b></section><footer><span>${escapeHtml(order.hubOrderId)}</span><span>${escapeHtml(new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</span></footer></article>`;
  }).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>하린식품 우체국 송장 라벨</title><meta name="referrer" content="no-referrer"><style>@page{size:100mm 150mm;margin:0}*{box-sizing:border-box}body{margin:0;background:#eef1ef;color:#101713;font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif}.actions{position:sticky;z-index:2;top:0;display:flex;gap:8px;padding:10px;background:#fff;border-bottom:1px solid #dfe5e1}.actions button{border:0;border-radius:8px;background:#1f684e;color:#fff;padding:10px 14px;font-weight:900}.label{width:100mm;height:150mm;margin:8mm auto;background:#fff;padding:7mm;display:flex;flex-direction:column;page-break-after:always}.label>header{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:4mm}.label>header div{display:flex;align-items:baseline;gap:4mm}.label>header b{font-size:22pt}.label>header span,.label>header em{font-size:10pt;font-style:normal}.receiver{padding:6mm 0 4mm;border-bottom:1px solid #111}.receiver small,.goods small{display:block;color:#5f6863;font-size:9pt;font-weight:900}.receiver h1{display:inline;margin:0 4mm 0 0;font-size:24pt}.receiver strong{font-size:13pt}.receiver p{margin:4mm 0 0;font-size:14pt;font-weight:800;line-height:1.45}.goods{display:flex;flex-direction:column;gap:2mm;padding:4mm 0}.goods b{font-size:11pt;line-height:1.35}.goods span{font-size:9pt;color:#4d5751}.barcode{margin-top:auto;text-align:center}.trackingBarcode{display:block;width:100%;height:24mm}.barcode>b{display:block;margin-top:2mm;font-family:Consolas,monospace;font-size:21pt;letter-spacing:2.2mm}.label footer{display:flex;justify-content:space-between;margin-top:4mm;border-top:1px solid #bbb;padding-top:2mm;color:#626b66;font-size:8pt}@media print{body{background:#fff}.actions{display:none}.label{margin:0}}</style></head><body><div class="actions"><button onclick="window.print()">송장 라벨 인쇄</button><button onclick="window.close()">닫기</button></div>${pages||'<p>인쇄할 우체국 송장이 없습니다.</p>'}</body></html>`;
}

export async function GET(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const params=new URL(request.url).searchParams;
    const type=['packing','dispatch','label'].includes(params.get('type'))?params.get('type'):'dispatch';
    const limit=type==='label'?20:100;
    const ids=new Set(String(params.get('ids')||'').split(',').filter(value=>/^HR-[A-Z]+-[A-F0-9]{8}$/.test(value)).slice(0,limit));
    const db=supabaseModule.getSupabase();
    const center=await unifiedOrdersModule.loadUnifiedOrders({db});
    let orders=center.orders.filter(order=>ids.has(order.hubOrderId));
    if(type==='label'){
      const history=await invoiceHistory(db,orders);
      orders=orders.map(order=>({...order,invoiceNumber:/^\d{13}$/.test(text(order.invoiceNumber))?text(order.invoiceNumber):history[order.hubOrderId]||''})).filter(order=>/^\d{13}$/.test(order.invoiceNumber));
      const receivers=await receiversForLabels(db,orders);
      return new Response(labelDocument(orders,receivers),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'"}});
    }
    return new Response(standardDocument(type,orders),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }catch(error){
    console.error('[shipping print]',{message:error.message});
    return apiSafety.json({ok:false,error:'인쇄 문서를 만들지 못했습니다.'},{status:500});
  }
}
