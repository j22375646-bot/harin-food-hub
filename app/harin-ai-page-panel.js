'use client';

import { useState } from 'react';

export default function HarinAiPagePanel({ panel, children }) {
  const [open,setOpen]=useState(false);
  if (!panel) return null;
  const enabled=panel.execution_enabled===true;
  return <details className={`aiPagePanel ${open?'open':''}`} open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>
      <div className="aiPagePulse" aria-hidden="true"><i/><i/><b>AI</b></div>
      <div className="aiPageHeadline"><span>12-5A · PAGE ANALYSIS</span><h2>{panel.title}</h2><p>{panel.summary}</p></div>
      <div className="aiPageStatus"><em className={enabled?'enabled':'locked'}>{enabled?'자동분석 사용 중':'사용 시작 전 · 비용 0원'}</em><strong>{panel.metric_value}</strong><small>{panel.metric_label}</small><b>{open?'접기 ↑':'분석 항목 보기 ↓'}</b></div>
    </summary>
    <div className="aiPageBody">
      <section className="aiPageFlow" aria-label="AI 자동분석 처리 순서">
        <article><i>1</i><span><b>자료 수집</b><small>{panel.sources.join(' · ')}</small></span></article><em>→</em>
        <article><i>2</i><span><b>서버 계산</b><small>금액·비율·차단 기준은 허브가 계산</small></span></article><em>→</em>
        <article><i>3</i><span><b>AI 설명</b><small>쉬운 말과 다음 행동으로 정리</small></span></article>
      </section>
      <section className="aiPageTaskList"><header><div><span>분석 예정 항목</span><b>{panel.readiness_label}</b></div><small>{panel.schedule}</small></header><div>{panel.tasks.map((task,index)=><span key={task}><i>{index+1}</i>{task}</span>)}</div></section>
      <p className="aiPageGuard"><b>{enabled?'자동분석이 켜져 있습니다.':'지금은 분석 예약석만 준비했습니다.'}</b> 페이지를 열어도 API를 호출하지 않으며 비용이 발생하지 않습니다. 개인정보는 보내지 않고, 실행·입찰 변경은 사장님 승인 전에는 작동하지 않습니다.</p>
      {open&&children?<div className="aiPageAdvanced">{children}</div>:null}
    </div>
  </details>;
}
