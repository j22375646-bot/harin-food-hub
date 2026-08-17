'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { HarinBadge, HarinCard, HarinPictogram } from '../../../_design-system/harin-ui.js';
import ConversionWorkbench from './conversion-client.js';

const GrowthLoopWorkbench=dynamic(()=>import('./growth-loop-client.js'),{loading:()=> <DeferredLoading label="성장 흐름"/>});
const ExecutionBridgeWorkbench=dynamic(()=>import('./execution-bridge-client.js'),{loading:()=> <DeferredLoading label="실행 연결"/>});

export default function ConversionStage({projectId,productName}){
  const [opened,setOpened]=useState({growth:false,execution:false});
  const toggle=key=>setOpened(current=>({...current,[key]:!current[key]}));
  return <section className="marketConversionStage">
    <ConversionWorkbench projectId={projectId} productName={productName}/>
    <section className="marketDeferredWorkbenches" aria-label="필요할 때 여는 보조 분석">
      <DeferredWorkbench icon="growth" tone="pink" eyebrow="혜택 · 구성 · 재구매" title="성장 흐름 더 보기" description="N배송, 묶음구성, 재구매 가설이 필요할 때만 자료를 불러와요." open={opened.growth} onToggle={()=>toggle('growth')}>
        {opened.growth?<GrowthLoopWorkbench projectId={projectId} productName={productName}/>:null}
      </DeferredWorkbench>
      <DeferredWorkbench icon="execution" tone="lavender" eyebrow="승인 · 실험 · 검증" title="실행 연결 더 보기" description="확인한 전환안을 승인·실험·결과검증으로 넘길 때만 열어요." open={opened.execution} onToggle={()=>toggle('execution')}>
        {opened.execution?<ExecutionBridgeWorkbench projectId={projectId} productName={productName}/>:null}
      </DeferredWorkbench>
    </section>
  </section>;
}

function DeferredWorkbench({icon,tone,eyebrow,title,description,open,onToggle,children}){
  return <section className={`marketDeferredWorkbench ${open?'open':''}`}>
    <button type="button" aria-expanded={open} onClick={onToggle}>
      <HarinPictogram icon={icon} tone={tone}/>
      <span><small>{eyebrow}</small><b>{title}</b><em>{description}</em></span>
      <HarinBadge tone={open?'info':'neutral'}>{open?'접기':'필요할 때 열기'}</HarinBadge>
      <i aria-hidden="true">{open?'−':'＋'}</i>
    </button>
    {open?<div className="marketDeferredWorkbenchBody">{children}</div>:null}
  </section>;
}

function DeferredLoading({label}){
  return <HarinCard className="marketDeferredLoading"><HarinPictogram icon="sparkles" tone="lavender"/><span><b>{label}을 여는 중이에요…</b><small>이 상품 프로젝트에 필요한 자료만 불러오고 있습니다.</small></span></HarinCard>;
}
