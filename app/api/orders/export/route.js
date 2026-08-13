import ExcelJS from 'exceljs';
import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import unifiedOrdersModule from '../../../../lib/orders/unified-orders.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function safeCell(value) {
  const text=value==null?'':String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function dateParam(value) {
  const text=String(value||'');
  return /^20\d{2}-\d{2}-\d{2}$/.test(text)?text:'';
}

export async function GET(request) {
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try {
    const params=new URL(request.url).searchParams;
    const platform=['NAVER','COUPANG','CAFE24'].includes(params.get('platform'))?params.get('platform'):'ALL';
    const stage=unifiedOrdersModule.STAGES.some(item=>item.id===params.get('stage'))?params.get('stage'):'ALL';
    const query=String(params.get('query')||'').trim().slice(0,100);
    const center=await unifiedOrdersModule.loadUnifiedOrders({db:supabaseModule.getSupabase()});
    const rows=unifiedOrdersModule.filterUnifiedOrders(center.orders,{
      platform,stage,query,startDate:dateParam(params.get('start')),endDate:dateParam(params.get('end')),actionRequired:params.get('action')==='1'
    });
    const workbook=new ExcelJS.Workbook();
    workbook.creator='하린식품 통합 주문센터';
    workbook.created=new Date();
    const sheet=workbook.addWorksheet('통합 주문');
    sheet.views=[{state:'frozen',ySplit:1}];
    sheet.columns=[
      {header:'허브 주문번호',key:'hubOrderId',width:20},{header:'채널',key:'channel',width:12},
      {header:'쇼핑몰 주문번호',key:'externalOrderId',width:24},{header:'공통 단계',key:'stage',width:14},
      {header:'원본 상태',key:'status',width:18},{header:'주문일시',key:'orderedAt',width:22},
      {header:'상품',key:'product',width:48},{header:'수량',key:'quantity',width:10},
      {header:'결제금액',key:'amount',width:16},{header:'처리 필요',key:'action',width:13},
      {header:'취소·반품 경고',key:'cancel',width:18},{header:'배송 방식',key:'fulfillment',width:16}
    ];
    for(const order of rows)sheet.addRow({
      hubOrderId:safeCell(order.hubOrderId),channel:order.channelLabel,externalOrderId:safeCell(order.externalOrderId),
      stage:unifiedOrdersModule.STAGES.find(item=>item.id===order.stage)?.label||order.stage,status:safeCell(order.status),
      orderedAt:order.orderedAt?new Date(order.orderedAt):'',product:safeCell(order.productName),quantity:order.quantity||0,
      amount:order.amount||0,action:order.actionRequired?'예':'아니오',cancel:order.cancellationRequested?'출고 전 확인':'',
      fulfillment:order.fulfillment==='ROCKET_GROWTH'?'로켓그로스':'판매자배송'
    });
    sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
    sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF22352D'}};
    sheet.autoFilter={from:'A1',to:'L1'};
    sheet.getColumn('orderedAt').numFmt='yyyy-mm-dd hh:mm';
    sheet.getColumn('amount').numFmt='#,##0"원"';
    sheet.eachRow((row,index)=>{row.alignment={vertical:'middle',wrapText:index>1};row.height=index===1?24:36;});
    const output=await workbook.xlsx.writeBuffer();
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    return new Response(output,{headers:{
      'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(`하린식품_통합주문_${today}.xlsx`)}`,
      'cache-control':'private, no-store','x-content-type-options':'nosniff'
    }});
  } catch(error) {
    console.error('[orders export]',error);
    return apiSafety.json({ok:false,error:'주문 엑셀을 만들지 못했습니다.'},{status:500});
  }
}
