'use strict';

const HEADLINES={
  LOWER:'광고비를 줄일지 먼저 검토해요',
  RAISE:'확대 전에 이익과 재고 안전선을 확인해요',
  KEEP:'현재 입찰가를 유지하며 지켜봐요',
  WATCH:'조금 더 지켜본 뒤 결정해요',
  OBSERVE:'조금 더 지켜본 뒤 결정해요',
  BLOCKED:'입찰 변경 전에 자료를 확인해야 해요'
};

function finite(value){
  if(value===null||value===undefined||value==='')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}

function money(value){
  const parsed=finite(value);
  return parsed==null?'판단 보류':`${Math.round(parsed).toLocaleString('ko-KR')}원`;
}

function count(value){
  const parsed=finite(value);
  return parsed==null?'판단 보류':`${Math.round(parsed).toLocaleString('ko-KR')}건`;
}

function percent(value){
  const parsed=finite(value);
  return parsed==null?'판단 보류':`${Number(parsed).toFixed(0)}%`;
}

function normalizedReasons(value){
  return Array.isArray(value)?value.map(item=>String(item||'').trim()).filter(Boolean).slice(0,4):[];
}

function buildAiPreview({platform,decision,metrics,reasons}){
  const observation=`광고비 ${money(metrics.cost)} · 주문 ${count(metrics.orders)} · ROAS ${percent(metrics.roas)}입니다.`;
  const impact=metrics.cost!=null&&metrics.cost>0&&metrics.orders===0
    ?'광고비는 사용됐지만 주문 근거가 없어 입찰 확대보다 손실 원인을 먼저 확인해야 합니다.'
    :metrics.roas==null
      ?'매출 귀속 또는 원가 근거가 부족해 실제 수익성 결론은 아직 보류합니다.'
      :'현재 성과와 입찰가를 같은 키워드 범위에서 비교할 수 있습니다.';
  let recommendation='현재 자료를 더 모은 뒤 같은 키워드 범위에서 다시 확인해주세요.';
  if(platform==='COUPANG')recommendation='쿠팡 WING에서 현재 입찰가를 확인한 뒤 수동 작업표로 반영해주세요.';
  else if(decision==='LOWER'&&metrics.recommended_bid!=null)recommendation=`운영 추천 ${money(metrics.recommended_bid)}을 참고해 변경 전 확인에서 최신값을 다시 조회해주세요.`;
  else if(decision==='RAISE'&&metrics.recommended_bid!=null)recommendation=`운영 추천 ${money(metrics.recommended_bid)} 안에서 이익·재고 안전선을 다시 확인해주세요.`;
  else if(decision==='KEEP')recommendation='현재 입찰가를 유지하고 순위와 주문 변화를 더 관찰해주세요.';
  else if(decision==='BLOCKED')recommendation=reasons[0]||'최신 광고 자료와 상품 안전선을 먼저 확인해주세요.';
  return {
    mode:'SERVER_PREVIEW',
    confidence:metrics.cost==null||metrics.orders==null?'LOW':'MEDIUM',
    observation,
    impact,
    recommendation,
    caution:'비용 없는 서버 미리보기이며 자동 입찰 변경이나 OpenAI 호출은 실행하지 않습니다.'
  };
}

function buildKeywordDetailWorkbench(row={}){
  const platform=String(row.platform||'NAVER').toUpperCase()==='COUPANG'?'COUPANG':'NAVER';
  const source=String(row.source||'REGISTERED').toUpperCase();
  const decision=String(row.decision||'WATCH').toUpperCase();
  const reasons=normalizedReasons(row.reasons);
  const metrics={
    cost:finite(row.cost),
    orders:finite(row.orders),
    roas:finite(row.roas),
    current_bid:finite(row.currentBid??row.current_bid),
    recommended_bid:finite(row.recommendedBid??row.recommended_bid)
  };
  const blocked=decision==='BLOCKED'||(platform==='NAVER'&&row.canDraft===false&&metrics.current_bid==null);
  const status=blocked?'BLOCKED':['LOWER','RAISE'].includes(decision)?'ACTION_REQUIRED':decision==='KEEP'?'STABLE':'WATCH';
  const normalizedDecision=blocked?'BLOCKED':decision;
  const sections=platform==='COUPANG'
    ?['DECISION','COUPANG_MANUAL','AI_PREVIEW']
    :source==='REGISTERED'
      ?['DECISION','NAVER_EVIDENCE','NAVER_HISTORY','AI_PREVIEW']
      :source==='HISTORY'
        ?['DECISION','NAVER_HISTORY','AI_PREVIEW']
        :['DECISION','AI_PREVIEW'];
  return {
    platform,
    source,
    status,
    headline:HEADLINES[normalizedDecision]||HEADLINES.WATCH,
    metrics,
    reasons,
    sections,
    write_mode:platform==='NAVER'?'NAVER_API_OWNER_CONFIRM':'COUPANG_WING_MANUAL',
    freshness:String(row.freshness||'확인 필요'),
    ai_preview:buildAiPreview({platform,decision:normalizedDecision,metrics,reasons})
  };
}

module.exports={buildKeywordDetailWorkbench};
