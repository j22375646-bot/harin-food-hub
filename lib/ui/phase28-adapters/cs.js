'use strict';

const number=value=>Number.isFinite(Number(value))?Number(value):0;

function frozenRows(items=[]){
  return Object.freeze(items.map(item=>Object.freeze(item)));
}

function buildPhase28CsModel(data={}){
  const center=data.customerService||{};
  const summary=center.summary||{};
  const active=Array.isArray(center.active)?center.active:[];
  const activeCount=number(summary.active);
  const overdueCount=number(summary.overdue);
  const unansweredCount=number(summary.unanswered);

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
    })
  });
}

module.exports={buildPhase28CsModel};
