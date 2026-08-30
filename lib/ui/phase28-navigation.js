'use strict';

const {PHASE28_ROUTES}=require('./phase28-route-registry.js');

const GROUPS=Object.freeze([
  {id:'operations',label:'오늘의 운영',items:['home','orders','cs','inventory','products','settlement','keywords']},
  {id:'growth',label:'성장과 관리',items:['product-analysis','analysis','development']},
  {id:'system',label:'시스템',items:['system','notifications']},
  {id:'records',label:'기록과 검증',items:['diagnoses','changes','validation','experiments','knowledge']}
]);

const COPY=Object.freeze({
  home:['오늘','가장 먼저 볼 판단'],
  orders:['주문·배송','출고·배송 처리'],
  cs:['고객·CS','문의·반품·교환'],
  inventory:['재고 운영','입고 필요 판단'],
  products:['상품 운영','상품·원가·채널 연결'],
  settlement:['정산·비용','지급·수수료·물류비'],
  keywords:['키워드','검색광고·입찰 운영'],
  'product-analysis':['상품분석','상품별 시장·고객 근거'],
  analysis:['인사이트','주간 변화·원인·행동'],
  development:['상품개발','상품·실험·시장전환'],
  system:['시스템','연결·자료·작업 복구'],
  notifications:['알림','발견·확인·처리'],
  diagnoses:['진단목록','저장 진단 보고서'],
  changes:['변경기록','변경 전후·롤백'],
  validation:['실행검증','7일·14일 결과'],
  experiments:['A/B 테스트','표본·신뢰도 판정'],
  knowledge:['AI 기준자료','원본·검수·적용 범위']
});

function buildPhase28Navigation({badges={}}={}) {
  const badgeValues=badges||{};
  const routes=new Map(PHASE28_ROUTES.map(route=>[route.id,route]));
  const groups=GROUPS.map(group=>Object.freeze({
    ...group,
    items:Object.freeze(group.items.map(id=>{
      const route=routes.get(id);
      if(!route)throw new Error(`Phase 28 경로 누락: ${id}`);
      return Object.freeze({
        id,
        href:route.href,
        label:COPY[id][0],
        description:COPY[id][1],
        badge:badgeValues[id]==null?null:Number(badgeValues[id])
      });
    }))
  }));
  return Object.freeze({
    groups:Object.freeze(groups),
    items:Object.freeze(groups.flatMap(group=>group.items)),
    mobilePrimary:Object.freeze(['home','orders','cs','inventory'])
  });
}

function buildPhase28Vitality(badges){
  if(!badges||typeof badges!=='object')return Object.freeze({known:false,attention:null,score:null,label:'확인 필요'});
  const attention=Object.values(badges).reduce((total,value)=>total+(Number.isFinite(value)&&value>0?value:0),0);
  const score=Math.max(25,100-Math.min(75,attention*6));
  return Object.freeze({known:true,attention,score,label:attention===0?'순항 중':attention<=4?'확인 중':'집중 운영'});
}

module.exports={GROUPS,COPY,buildPhase28Navigation,buildPhase28Vitality};
