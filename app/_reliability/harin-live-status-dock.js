'use client';

import './harin-live-status-dock.css';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import HarinIcon from '../_design-system/harin-icon.js';
import { buildExceptions, PLATFORM_LABEL, workerHeartbeatReady } from './harin-reliability-model.js';

export default function HarinLiveStatusDock({center={},alerts=[],generatedAt}){
  const [open,setOpen]=useState(false);
  const [clock,setClock]=useState(null);
  useEffect(()=>{
    setClock(Date.now());
    const timer=window.setInterval(()=>setClock(Date.now()),30000);
    return()=>window.clearInterval(timer);
  },[]);
  const exceptions=useMemo(()=>buildExceptions(center,alerts),[center,alerts]);
  const ready=Number(center.summary?.ready_channels||0);
  const workerReady=workerHeartbeatReady(center.reliability||{});
  const generated=new Date(generatedAt||Date.now()).getTime();
  const age=clock==null||Number.isNaN(generated)?null:Math.max(0,Math.floor((clock-generated)/60000));
  const healthy=ready===3&&workerReady&&!exceptions.length;
  return <aside className={`liveStatusDock ${open?'open':''} ${healthy?'healthy':'attention'}`} aria-label="실시간 운영 상태">
    <button className="liveStatusToggle" type="button" onClick={()=>setOpen(value=>!value)} aria-expanded={open}><i aria-hidden="true"/><span><b>{healthy?'운영 정상':`확인 ${exceptions.length}건`}</b><small>채널 {ready}/3 · 워커 {workerReady?'연결':'확인'}</small></span><em>{age==null?'갱신 확인':age<1?'방금':`${age}분 전`}</em><u aria-hidden="true"><HarinIcon name="chevron" size={17}/></u></button>
    {open?<div className="liveStatusBody"><header><span><small>LIVE STATUS</small><b>운영 신호 바로보기</b></span><button type="button" onClick={()=>setOpen(false)} aria-label="상태 도크 닫기"><HarinIcon name="close" size={20}/></button></header><section><article><i className={ready===3?'ready':'warning'}/><span><b>채널 준비 {ready}/3</b><small>정상 자료만 계산에 사용합니다.</small></span></article><article><i className={workerReady?'ready':'danger'}/><span><b>고정 IP 워커 {workerReady?'연결됨':'확인 필요'}</b><small>쿠팡·네이버 작업 서버 신호</small></span></article></section>{exceptions.length?<div className="liveStatusExceptions">{exceptions.slice(0,3).map(item=><p key={item.id}><i/><span><b>{item.title}</b><small>{PLATFORM_LABEL[item.platform]||item.platform}</small></span></p>)}</div>:<p className="liveStatusClear">새로운 실패·지연 신호가 없습니다.</p>}<nav><Link href="/data-collection">데이터수집 보기</Link><Link href="/notifications">알림 처리하기</Link></nav></div>:null}
  </aside>;
}
