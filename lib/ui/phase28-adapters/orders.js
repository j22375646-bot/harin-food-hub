'use strict';

const number=value=>Number.isFinite(Number(value))?Number(value):0;
const invoiceReady=value=>/^\d{13}$/.test(String(value||'').replace(/\D/g,''));
const activeStage=value=>['PAID','PREPARING','READY_TO_SHIP'].includes(String(value||''));

function frozenRows(items=[]){
  return Object.freeze(items.map(item=>Object.freeze(item)));
}

function buildPhase28OrdersModel(data={}){
  const center=data.unifiedOrders||{};
  const orders=Array.isArray(center.orders)?center.orders:[];
  const sellerOrders=orders.filter(item=>item.fulfillment!=='ROCKET_GROWTH');
  const active=sellerOrders.filter(item=>activeStage(item.stage)&&!invoiceReady(item.invoiceNumber)&&!item.cancelled);
  const epost=active.filter(item=>item.shippingEligible===true);
  const registered=sellerOrders.filter(item=>!item.cancelled&&invoiceReady(item.invoiceNumber)&&!['SHIPPING','DELIVERED'].includes(item.stage));
  const inTransit=sellerOrders.filter(item=>item.stage==='SHIPPING'||item.tracking?.statusCode==='IN_TRANSIT');
  const completed=sellerOrders.filter(item=>item.stage==='DELIVERED'||item.stage==='CANCELLED'||item.tracking?.statusCode==='DELIVERED');
  const delayed=active.filter(item=>item.timingBadge?.type==='DELAYED');
  const cancellationCount=number(center.summary?.cancellations);
  const asOf=data.generatedAt||center.summary?.refreshedAt||null;

  const workspaces=frozenRows([
    {id:'ACTIVE',label:'송장 발급 전',count:active.length,status:'READY',description:'지금 포장·출고할 판매자배송'},
    {id:'EPOST',label:'우체국 발급',count:epost.length,status:'READY',description:'출고 가능한 선택 주문'},
    {id:'REGISTER',label:'배송대기중',count:registered.length,status:'READY',description:'송장 등록 후 접수 대기'},
    {id:'IN_TRANSIT',label:'배송중',count:inTransit.length,status:'READY',description:'우체국 이동 상태 확인'},
    {id:'COMPLETED',label:'최근 완료',count:completed.length,status:'READY',description:'최근 30일 완료·취소 이력'},
    {id:'RETRY',label:'재시도',count:null,status:'CHECK_REQUIRED',description:'현재 화면 실행 결과에서 집계'}
  ]);

  return Object.freeze({
    kind:'orders',
    hero:Object.freeze({
      asOf,
      workCount:active.length,
      delayedCount:delayed.length,
      cancellationCount,
      headline:active.length?`오늘 출고할 주문은 ${active.length.toLocaleString('ko-KR')}건이에요.`:'오늘 새로 출고할 주문은 없어요.',
      summary:delayed.length?`배송지연 ${delayed.length.toLocaleString('ko-KR')}건을 먼저 확인한 뒤 출고 순서대로 처리하세요.`:'판매자배송만 모아 송장 발급부터 배송 확인까지 이어서 처리합니다.'
    }),
    workspaces,
    channels:frozenRows((center.channels||[]).map(item=>({...item}))),
    priorities:frozenRows(active.slice(0,5).map(item=>({
      id:String(item.hubOrderId||item.externalOrderId||''),
      platform:String(item.platform||'ALL'),
      productName:String(item.productName||item.items?.[0]?.name||'상품 정보 확인 필요'),
      timingType:String(item.timingBadge?.type||'READY'),
      timingLabel:String(item.timingBadge?.label||'출고 준비'),
      cancellationRequested:Boolean(item.cancellationRequested)
    }))),
    window:Object.freeze({
      days:number(center.summary?.windowDays)||30,
      start:center.summary?.windowStart||null,
      end:center.summary?.windowEnd||null
    })
  });
}

module.exports={buildPhase28OrdersModel};
