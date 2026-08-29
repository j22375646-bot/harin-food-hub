'use strict';

const number=value=>Number.isFinite(Number(value))?Number(value):0;
const text=value=>value==null?'':String(value);

function frozenRows(items=[]){
  return Object.freeze(items.map(item=>Object.freeze(item)));
}

function mappedOrder(order){
  if(!order)return null;
  return Object.freeze({
    orderId:text(order.orderId),
    platform:text(order.platform),
    status:text(order.status)||'확인 필요',
    orderedAt:order.orderedAt||null,
    shipmentBoxId:text(order.shipmentBoxId)||null,
    amount:Number.isFinite(Number(order.amount))?Number(order.amount):null,
    products:frozenRows((order.products||[]).slice(0,4).map(product=>({
      name:text(product.name)||'상품명 확인 필요',
      option:text(product.option)||null,
      quantity:number(product.quantity)
    })))
  });
}

function mappedSource(source={}){
  return Object.freeze({
    inquiryId:text(source.inquiry_id)||null,
    inquiryType:text(source.inquiry_type)||null,
    parentAnswerId:text(source.parent_answer_id)||null,
    shipmentBoxId:text(source.shipment_box_id)||null,
    collectStatus:text(source.collect_status)||null,
    canReceive:Boolean(source.can_receive),
    canApprove:Boolean(source.can_approve),
    canReject:Boolean(source.can_reject),
    canPickupInvoice:Boolean(source.can_pickup_invoice),
    canShippingInvoice:Boolean(source.can_shipping_invoice)
  });
}

function mappedRow(item){
  const completed=Boolean(item.completed);
  const kind=text(item.kind)||'INQUIRY';
  return {
    id:text(item.id||item.sourceId),
    sourceId:text(item.sourceId),
    platform:text(item.platform)||'ALL',
    kind,
    kindLabel:text(item.kindLabel)||({INQUIRY:'문의',CANCEL:'취소',RETURN:'반품',EXCHANGE:'교환'}[kind]||'고객 문의'),
    title:text(item.title)||'고객 문의',
    content:text(item.content)||'문의 원문 확인 필요',
    occurredAt:item.occurredAt||null,
    completed,
    status:text(item.status)||(completed?'COMPLETED':'WAITING'),
    due:Object.freeze({
      code:text(item.due?.code)||(completed?'COMPLETED':'WAITING'),
      label:text(item.due?.label)||(completed?'처리완료':'답변 대기'),
      ageHours:Number.isFinite(Number(item.due?.ageHours))?Number(item.due.ageHours):null
    }),
    orderId:text(item.orderId)||null,
    productId:text(item.productId)||null,
    order:mappedOrder(item.order),
    source:mappedSource(item.source),
    audit:item.audit?Object.freeze({...item.audit}):null,
    stageIds:Object.freeze(completed?['HISTORY']:kind==='INQUIRY'?['ACTIVE']:['ACTIVE','CLAIMS'])
  };
}

function buildPhase28CsModel(data={}){
  const center=data.customerService||{};
  const summary=center.summary||{};
  const active=Array.isArray(center.active)?center.active:[];
  const activeCount=number(summary.active);
  const overdueCount=number(summary.overdue);
  const unansweredCount=number(summary.unanswered);
  const rows=(Array.isArray(center.rows)?center.rows:active).slice(0,80).map(mappedRow);

  return Object.freeze({
    kind:'cs',
    hero:Object.freeze({
      asOf:data.generatedAt||center.generatedAt||null,
      activeCount,
      overdueCount,
      unansweredCount,
      claimCount:number(summary.claims),
      headline:activeCount?`오늘 답할 문의는 ${activeCount.toLocaleString('ko-KR')}건이에요.`:'지금 답할 문의는 없어요.',
      summary:overdueCount?`기한을 넘긴 ${overdueCount.toLocaleString('ko-KR')}건을 먼저 확인하고 필요한 답변부터 처리하세요.`:'문의와 주문 상태를 한 화면에서 확인하고 필요한 답변부터 처리합니다.'
    }),
    channels:frozenRows((center.channelStates||[]).map(item=>({...item}))),
    rows:frozenRows(rows),
    templates:frozenRows((center.templates||[]).map(item=>({
      id:text(item.id),
      label:text(item.label),
      content:text(item.content)
    }))),
    priorities:frozenRows(active.slice(0,5).map(item=>({
      id:String(item.id||''),
      platform:String(item.platform||'ALL'),
      kind:String(item.kind||'INQUIRY'),
      title:String(item.title||item.kindLabel||'고객 문의'),
      excerpt:String(item.content||'문의 내용을 확인하세요.'),
      dueCode:String(item.due?.code||'WAITING'),
      dueLabel:String(item.due?.label||'답변 대기'),
      ageHours:Number.isFinite(Number(item.due?.ageHours))?Number(item.due.ageHours):null,
      linkedOrder:Boolean(item.order)
    }))),
    summary:Object.freeze({
      active:activeCount,
      unanswered:unansweredCount,
      overdue:overdueCount,
      claims:number(summary.claims),
      linkedOrders:number(summary.linkedOrders),
      completed:number(summary.completed)
    }),
    responseTargetMinutes:30,
    visibleLimit:20
  });
}

module.exports={buildPhase28CsModel};
