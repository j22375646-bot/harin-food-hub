'use client';

import './keyword-bid-operations-overview.css';
import {useEffect,useMemo,useState} from 'react';
import {HarinIcon} from '../_design-system/harin-icon.js';

const STATUS_COPY={
  ACTIVE:['자동 적용 중','active'],OBSERVE:['관찰 중','observe'],PAUSED:['정지','paused'],
  ACTION_REQUIRED:['확인 필요','warning'],SETUP_REQUIRED:['설정 필요','setup'],EMERGENCY_PAUSED:['전체 긴급정지','danger']
};
const MODE_LABEL={ACTIVE:'자동 적용',OBSERVE:'관찰만',PAUSED:'정지'};
const when=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'아직 실행 전';
const count=value=>Number(value||0).toLocaleString('ko-KR');

export default function KeywordBidOperationsOverview({adgroups=[],selectedAdgroupId='ALL',onSelectAdgroup}){
  const [result,setResult]=useState(null);
  const [state,setState]=useState('LOADING');
  const [refreshKey,setRefreshKey]=useState(0);
  const groupMap=useMemo(()=>new Map(adgroups.map(item=>[String(item.id),item])),[adgroups]);
  useEffect(()=>{
    const controller=new AbortController();setState('LOADING');
    fetch('/api/naver/bid-schedules?overview=1',{cache:'no-store',signal:controller.signal})
      .then(async response=>{const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'자동입찰 운영 현황을 불러오지 못했습니다.');return data.overview;})
      .then(data=>{setResult(data);setState('READY');})
      .catch(error=>{if(error.name!=='AbortError'){setResult({error:error.message||'운영 현황을 불러오지 못했습니다.'});setState('FAILED');}});
    return()=>controller.abort();
  },[refreshKey]);
  const configuredIds=new Set((result?.groups||[]).map(item=>String(item.ncc_adgroup_id)));
  const activeCatalog=adgroups.filter(item=>item.operationalState!=='INACTIVE');
  const unconfigured=Math.max(0,activeCatalog.filter(item=>!configuredIds.has(String(item.id))).length);
  const status=STATUS_COPY[result?.status]||['확인 필요','setup'];
  return <section className={`bidOperationsOverview ${status[1]}`} aria-label="네이버 자동입찰 운영 현황">
    <header>
      <span className="bidOperationsIdentity"><i><HarinIcon name="speed" size={22}/></i><span><b>자동입찰 운영 현황</b><em>실행 상태와 최근 결과를 한곳에서 확인해요.</em></span></span>
      <span className="bidOperationsState"><i aria-hidden="true"/><span><small>현재 상태</small><b>{state==='LOADING'?'확인 중':state==='FAILED'?'불러오기 실패':status[0]}</b></span><button type="button" onClick={()=>setRefreshKey(value=>value+1)} disabled={state==='LOADING'} aria-label="자동입찰 운영 현황 새로고침"><HarinIcon name="sync" size={18}/></button></span>
    </header>
    {state==='FAILED'?<p className="bidOperationsError" role="status"><HarinIcon name="warning" size={19}/><span><b>운영 현황을 확인하지 못했어요</b><small>{result?.error||'잠시 뒤 다시 확인해주세요.'}</small></span></p>:<>
      <div className="bidOperationsMetrics">
        <span><small>자동 적용 그룹</small><b>{state==='LOADING'?'—':count(result?.summary?.active_groups)}</b><em>{result?.automation_enabled?'서버 실행 허용':'서버 적용 잠금'}</em></span>
        <span><small>관찰 그룹</small><b>{state==='LOADING'?'—':count(result?.summary?.observing_groups)}</b><em>입찰가 변경 없음</em></span>
        <span className={result?.summary?.action_required_groups?'warning':''}><small>확인할 그룹</small><b>{state==='LOADING'?'—':count(result?.summary?.action_required_groups)}</b><em>실패·잠금·긴급정지</em></span>
        <span className={unconfigured?'setup':''}><small>운영 중 미설정</small><b>{state==='LOADING'?'—':count(unconfigured)}</b><em>시간표 미저장</em></span>
      </div>
      <div className="bidOperationsFlow" aria-label="자동입찰 최근 실행 합계"><span><i><HarinIcon name="target" size={18}/></i><small>최근 계획</small><b>{count(result?.summary?.planned_changes)}건</b></span><i>→</i><span><i><HarinIcon name="check" size={18}/></i><small>적용·확인</small><b>{count(result?.summary?.executed_changes)}건</b></span><i>→</i><span><i><HarinIcon name="shield" size={18}/></i><small>안전 차단</small><b>{count(result?.summary?.blocked_changes)}건</b></span><em>최근 활동 {when(result?.latest_activity_at)}</em></div>
      <div className="bidOperationsGroups">
        {(result?.groups||[]).map(item=>{const meta=groupMap.get(String(item.ncc_adgroup_id));const copy=STATUS_COPY[item.status]||['확인 필요','setup'];return <button type="button" className={`${copy[1]} ${String(selectedAdgroupId)===String(item.ncc_adgroup_id)?'selected':''}`} key={item.ncc_adgroup_id} onClick={()=>onSelectAdgroup?.(item.ncc_adgroup_id)}><i><HarinIcon name={item.status==='ACTION_REQUIRED'?'warning':item.mode==='ACTIVE'?'sync':item.mode==='OBSERVE'?'search':'clock'} size={19}/></i><span><b>{meta?.name||item.ncc_adgroup_id}</b><small>{MODE_LABEL[item.mode]||item.mode} · 안전설정 {count(item.safe_keyword_count)}개</small></span><em>{copy[0]}</em><strong>{item.reason}</strong><small>{when(item.latest_activity_at)} · 계획 {count(item.planned_count)} / 적용 {count(item.executed_count)} / 차단 {count(item.blocked_count)}</small></button>;})}
        {state==='READY'&&!result?.groups?.length?<p className="bidOperationsEmpty"><HarinIcon name="clock" size={20}/><span><b>아직 저장된 자동입찰 시간표가 없어요</b><small>아래에서 광고그룹을 고르고 관찰 또는 자동 적용 시간을 저장해주세요.</small></span></p>:null}
      </div>
    </>}
  </section>;
}
