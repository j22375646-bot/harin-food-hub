'use client';

import { HarinButton, HarinCard, HarinPictogram } from '../../_design-system/harin-ui.js';

export function MarketWorkbenchError({title='자료를 불러오지 못했어요',message='잠시 뒤 다시 시도해주세요.',onRetry}){
  return <HarinCard className="marketWorkbenchError" role="alert">
    <HarinPictogram icon="warning" tone="pink"/>
    <span><b>{title}</b><p>{message}</p></span>
    {onRetry?<HarinButton variant="secondary" icon="refresh" onClick={onRetry}>다시 불러오기</HarinButton>:null}
  </HarinCard>;
}
