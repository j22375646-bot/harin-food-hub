'use client';

import { useEffect } from 'react';
import { HarinButton, HarinCard, HarinPictogram } from '../_design-system/harin-ui.js';

export default function MarketIntelligenceError({error,reset}){
  useEffect(()=>{console.error('market-intelligence route error',error?.digest||'unknown');},[error]);
  return <main className="marketRouteError">
    <HarinCard>
      <HarinPictogram icon="warning" tone="pink"/>
      <span><small>이 페이지에서만 문제가 생겼어요</small><h1>상품 분석 화면을 다시 열어볼게요</h1><p>다른 운영 화면과 저장된 자료는 그대로 유지됩니다. 계속되면 데이터수집 상태를 확인해주세요.</p></span>
      <div><HarinButton variant="primary" icon="refresh" onClick={reset}>이 화면 다시 열기</HarinButton><HarinButton as="a" href="/data-collection" variant="secondary" icon="database">수집상태 확인</HarinButton></div>
    </HarinCard>
  </main>;
}
