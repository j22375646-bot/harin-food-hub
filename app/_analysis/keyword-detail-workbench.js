'use client';

import detailWorkbenchModule from '../../lib/marketing/keyword-detail-workbench.js';
import HarinIcon from '../_design-system/harin-icon.js';
import './keyword-detail-workbench.css';

const STATUS_LABEL={ACTION_REQUIRED:'조치 검토',STABLE:'유지 관찰',WATCH:'조금 더 관찰',BLOCKED:'판단 보류'};
const PLATFORM_LABEL={NAVER:'네이버',COUPANG:'쿠팡'};
const money=value=>value==null?'판단 보류':`${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
const count=value=>value==null?'판단 보류':`${Math.round(Number(value)).toLocaleString('ko-KR')}건`;
const percent=value=>value==null?'판단 보류':`${Number(value).toFixed(0)}%`;

export default function KeywordDetailWorkbench({
  detail,
  draftValue='',
  searchUrl=null,
  evidencePanel=null,
  historyPanel=null,
  onClose,
  onChangeBid,
  onNormalizeBid,
  onUseRecommendation
}){
  const view=detailWorkbenchModule.buildKeywordDetailWorkbench(detail);
  const naverRegistered=view.sections.includes('NAVER_EVIDENCE');
  const hasHistory=view.sections.includes('NAVER_HISTORY');
  const manual=view.sections.includes('COUPANG_MANUAL');
  return <aside className="keywordOpsDetail keywordDetailWorkbench" aria-label="선택 키워드 상세">
    <header><span>KEYWORD DECISION DESK</span><button type="button" onClick={onClose} aria-label="상세 닫기"><HarinIcon name="close" size={20}/></button></header>

    <div className="keywordOpsDetailTitle">
      <i className={view.platform.toLowerCase()}>{view.platform==='NAVER'?'N':'C'}</i>
      <span><b>{detail.keyword}</b><small>{PLATFORM_LABEL[view.platform]} · {detail.campaignName||detail.campaign}{detail.adgroupName?` · ${detail.adgroupName}`:''}</small></span>
    </div>

    {searchUrl?<a className="keywordOpsNaverSearch" href={searchUrl} target="_blank" rel="noreferrer"><i><HarinIcon name="search" size={18}/></i><span><b>네이버 검색에서 확인</b><small>현재 검색 결과를 새 창에서 열어요.</small></span><em>↗</em></a>:null}

    <section className={`keywordDetailDecision ${view.status.toLowerCase()}`} id="keyword-detail-decision">
      <header><span><small>지금 판단</small><b>{view.headline}</b></span><em>{STATUS_LABEL[view.status]||'확인 필요'}</em></header>
      <p>{view.ai_preview.impact}</p>
    </section>

    <nav className="keywordDetailRail" aria-label="선택 키워드 상세 바로가기">
      <a href="#keyword-detail-decision"><HarinIcon name="checklist" size={17}/><span>성과·입찰</span></a>
      {naverRegistered?<a href="#keyword-detail-evidence"><HarinIcon name="target" size={17}/><span>공식 근거</span></a>:null}
      {hasHistory?<a href="#keyword-detail-history"><HarinIcon name="clock" size={17}/><span>변경 기록</span></a>:null}
      <a href="#keyword-detail-ai"><HarinIcon name="ai" size={17}/><span>AI 설명</span></a>
    </nav>

    <dl className="keywordDetailMetrics">
      <div><dt>광고비</dt><dd>{money(view.metrics.cost)}</dd></div>
      <div><dt>주문·전환</dt><dd>{count(view.metrics.orders)}</dd></div>
      <div><dt>ROAS</dt><dd>{percent(view.metrics.roas)}</dd></div>
      <div><dt>최신 기준</dt><dd>{view.freshness}</dd></div>
    </dl>

    {detail.canDraft?<section className="keywordOpsDetailBid">
      <header><span><small>변경 초안</small><b>네이버 변경 입찰가</b></span><em>현재 {money(view.metrics.current_bid)}</em></header>
      <p>운영 추천 {money(view.metrics.recommended_bid)} · 아직 네이버에 반영되지 않았어요.</p>
      <div><input type="number" inputMode="numeric" step="10" min={detail.minimumBid??70} max={detail.maximumBid??100000} value={draftValue} placeholder="직접 입력" aria-label={`${detail.keyword} 변경 입찰가`} onChange={event=>onChangeBid?.(event.target.value)} onBlur={()=>onNormalizeBid?.()}/><button type="button" disabled={view.metrics.recommended_bid==null} onClick={onUseRecommendation}>추천가</button></div>
      <small>{detail.manualDecreaseOnly?'추천 근거가 준비되기 전에는 현재가보다 낮은 값만 직접 적용할 수 있어요.':'입력하면 이 키워드가 선택되고, 상단 변경 전 확인에서 최신값을 다시 조회합니다.'}</small>
    </section>:null}

    <section className="keywordDetailReasons">
      <header><HarinIcon name="shield" size={18}/><b>판단 근거</b></header>
      {view.reasons.length?<ul>{view.reasons.map((reason,index)=><li key={`${reason}-${index}`}>{reason}</li>)}</ul>:<p>서버 계산 결과 추가 차단 사유가 없습니다.</p>}
    </section>

    {naverRegistered?<div className="keywordDetailEvidence" id="keyword-detail-evidence">{evidencePanel}</div>:null}
    {hasHistory?<div className="keywordDetailHistory" id="keyword-detail-history">{historyPanel}</div>:null}

    <section className="keywordDetailAi" id="keyword-detail-ai">
      <header><span><i><HarinIcon name="ai" size={19}/></i><span><small>선택 키워드 AI 설명</small><b>{detail.keyword}만 먼저 풀어봤어요</b></span></span><em>서버 미리보기 · 비용 0원</em></header>
      <div>
        <article><i>01</i><span><small>무엇이 보이나요?</small><b>{view.ai_preview.observation}</b></span></article>
        <article><i>02</i><span><small>왜 중요한가요?</small><b>{view.ai_preview.impact}</b></span></article>
        <article className="action"><i>03</i><span><small>지금 무엇을 할까요?</small><b>{view.ai_preview.recommendation}</b></span></article>
      </div>
      <footer><small>{view.ai_preview.caution}</small><a href="#page-ai-analysis">키워드 페이지 AI 전체 보기 <b>→</b></a></footer>
    </section>

    <section className="keywordOpsDetailSafety">
      <b>{manual?'쿠팡 적용 방법':detail.applicationMode==='HISTORY'?'실행·재조회 상태':'변경 안전장치'}</b>
      <p>{manual?'현재는 WING에서 직접 적용해야 하며, 허브는 성공으로 표시하지 않습니다.':detail.applicationMode==='HISTORY'?'변경 전·후 값과 네이버 재조회 결과를 보존합니다. 불일치하면 성공으로 표시하지 않습니다.':'마지막 확인을 누르면 네이버 현재값을 다시 읽고, 반영 뒤 한 번 더 재조회합니다. 오래된 값이나 쓰기 잠금은 자동 차단됩니다.'}</p>
    </section>
  </aside>;
}
