import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import unifiedOrdersModule from '../../../../lib/orders/unified-orders.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));

export async function GET(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  const params=new URL(request.url).searchParams;
  const ids=new Set(String(params.get('ids')||'').split(',').filter(value=>/^HR-[A-Z]+-[A-F0-9]{8}$/.test(value)).slice(0,100));
  const type=params.get('type')==='packing'?'packing':'dispatch';
  const center=await unifiedOrdersModule.loadUnifiedOrders({db:supabaseModule.getSupabase()});
  const orders=center.orders.filter(order=>ids.has(order.hubOrderId));
  const title=type==='packing'?'포장명세서':'출고목록';
  const rows=orders.map((order,index)=>`<tr><td>${index+1}</td><td><b>${escapeHtml(order.hubOrderId)}</b><br><small>${escapeHtml(order.channelLabel)} · ${escapeHtml(order.externalOrderId)}</small></td><td>${order.items.map(item=>escapeHtml(`${item.name}${item.option?` (${item.option})`:''} × ${item.quantity}`)).join('<br>')}</td><td>${escapeHtml((order.packagingInstructions||[]).join(' / '))}</td><td class="check">□</td></tr>`).join('');
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>하린식품 ${title}</title><style>@page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#18221e;margin:0}header{display:flex;justify-content:space-between;align-items:end;border-bottom:3px solid #1f684e;padding-bottom:10px;margin-bottom:14px}h1{margin:0;font-size:25px}header p{margin:4px 0 0;color:#64716b;font-size:12px}header b{font-size:12px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}th{background:#eaf3ef;padding:9px 7px;text-align:left}td{border-bottom:1px solid #dce4e0;padding:10px 7px;vertical-align:top;line-height:1.5}th:nth-child(1),td:nth-child(1){width:7%;text-align:center}th:nth-child(2),td:nth-child(2){width:24%}th:nth-child(3),td:nth-child(3){width:31%}th:nth-child(5),td:nth-child(5){width:8%;text-align:center}.check{font-size:20px}small{color:#6d7872}.notice{margin-top:14px;border:1px solid #e4c68e;background:#fff9ec;padding:10px;font-size:10px}.actions{display:flex;gap:8px;margin-bottom:14px}.actions button{border:0;border-radius:8px;background:#1f684e;color:white;padding:9px 13px;font-weight:700}@media print{.actions{display:none}}</style></head><body><div class="actions"><button onclick="window.print()">PDF로 인쇄·저장</button><button onclick="window.close()">닫기</button></div><header><div><h1>하린식품 ${title}</h1><p>선택 주문 ${orders.length}건 · 개인정보를 저장하지 않는 작업용 문서</p></div><b>${escapeHtml(new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</b></header><table><thead><tr><th>순서</th><th>주문</th><th>상품·수량</th><th>포장 지시</th><th>확인</th></tr></thead><tbody>${rows||'<tr><td colspan="5">선택한 주문이 없습니다.</td></tr>'}</tbody></table><p class="notice">묶음배송 후보는 자동 합배송이 아닙니다. 특히 쿠팡 주문은 각 쇼핑몰 정책을 확인한 뒤 처리하세요.</p></body></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}
