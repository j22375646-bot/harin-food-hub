'use strict';

const COUPANG_AD_CAPABILITY=Object.freeze({
  platform:'COUPANG',
  dataSource:'WING_FILE_IMPORT',
  bidRead:'MANUAL_REQUIRED',
  bidWrite:'MANUAL_REQUIRED',
  publicBidWriteEndpointDocumented:false,
  verifiedAt:'2026-08-16',
  docsUrl:'https://developers.coupangcorp.com/hc/ko'
});

const ACTION_LABELS=Object.freeze({
  LOWER:'감액 검토',
  PAUSE:'중지·제외 검토',
  KEEP:'유지',
  RAISE:'증액 검토',
  WATCH:'관찰'
});

const text=value=>String(value??'').trim();
const nullablePositiveInteger=value=>{
  if(value==null||text(value)==='')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>0?Math.round(parsed):null;
};

function suggestedAction(row={}){
  if(Number(row.cost)>0&&Number(row.orders)<=0)return 'LOWER';
  return ['LOWER','RAISE','KEEP','WATCH'].includes(row.decision)?row.decision:'WATCH';
}

function buildCoupangWingWorklist(rows=[],drafts={}){
  return rows
    .filter(row=>row?.platform==='COUPANG'&&row?.applicationMode==='MANUAL_REQUIRED')
    .map(row=>{
      const draft=drafts?.[row.id]||{};
      const action=ACTION_LABELS[draft.action]?draft.action:suggestedAction(row);
      const currentBid=nullablePositiveInteger(draft.currentBid);
      const targetBid=nullablePositiveInteger(draft.targetBid);
      return {
        id:row.id,
        platform:'COUPANG',
        keyword:text(row.keyword)||'키워드 없음',
        campaign:text(row.campaign)||'캠페인 확인 필요',
        product:text(row.product)||'상품 연결 확인',
        clicks:Number(row.clicks)||0,
        cost:Number(row.cost)||0,
        orders:Number(row.orders)||0,
        roas:Number.isFinite(Number(row.roas))?Number(row.roas):null,
        action,
        actionLabel:ACTION_LABELS[action],
        currentBid,
        targetBid,
        memo:text(draft.memo),
        status:targetBid==null?'WING_BID_REQUIRED':'READY_FOR_WING',
        applied:false
      };
    });
}

function safeSpreadsheetCell(value){
  const raw=value==null?'':String(value);
  return /^[=+\-@]/.test(raw)?`'${raw}`:raw;
}

function csvCell(value){
  return `"${safeSpreadsheetCell(value).replace(/"/g,'""')}"`;
}

function coupangWingCsv(items=[]){
  const rows=[
    ['플랫폼','키워드','캠페인','상품','최근 클릭','최근 광고비','최근 주문','ROAS','권장 조치','WING 현재 입찰가','WING 적용 입찰가','메모','허브 상태'],
    ...items.map(item=>[
      '쿠팡',item.keyword,item.campaign,item.product,item.clicks,item.cost,item.orders,
      item.roas==null?'':`${item.roas.toFixed(1)}%`,item.actionLabel,item.currentBid??'',item.targetBid??'',item.memo,
      item.status==='READY_FOR_WING'?'WING 직접 반영 필요':'WING 입찰가 확인 필요'
    ])
  ];
  return `\uFEFF${rows.map(row=>row.map(csvCell).join(',')).join('\r\n')}`;
}

function coupangWingClipboard(items=[]){
  const header='[쿠팡 WING 광고 키워드 작업표]';
  const lines=items.map((item,index)=>{
    const bids=item.targetBid==null?'입찰가: WING 확인 필요':`입찰가: ${item.currentBid??'확인 필요'}원 → ${item.targetBid}원`;
    return `${index+1}. ${item.keyword} | ${item.campaign} | ${item.actionLabel} | ${bids}${item.memo?` | ${item.memo}`:''}`;
  });
  return [header,...lines,'','※ 허브에서 쿠팡에 자동 반영한 결과가 아닙니다. WING에서 직접 반영 후 확인하세요.'].join('\n');
}

module.exports={COUPANG_AD_CAPABILITY,ACTION_LABELS,buildCoupangWingWorklist,coupangWingCsv,coupangWingClipboard,nullablePositiveInteger,safeSpreadsheetCell};
