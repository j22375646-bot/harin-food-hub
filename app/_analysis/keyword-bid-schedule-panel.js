'use client';

import './keyword-bid-schedule-panel.css';
import {useEffect,useMemo,useState} from 'react';
import {HarinIcon} from '../_design-system/harin-icon.js';

const DAYS=[['월',1],['화',2],['수',3],['목',4],['금',5],['토',6],['일',0]];
const DEFAULT={mode:'PAUSED',weekdays:[1,2,3,4,5],start_minute:540,end_minute:1080,interval_minutes:60,max_changes_per_run:3,daily_change_limit:6,allow_increase:false};
const MODE_COPY={PAUSED:['정지','아무 작업도 하지 않아요'],OBSERVE:['관찰만','예상값과 차단 사유만 기록해요'],ACTIVE:['자동 적용','안전조건을 통과한 키워드만 변경해요']};
const RUN_LABEL={OBSERVED:'관찰 완료',COMPLETED:'적용·재조회 완료',PARTIAL:'일부 확인 필요',FAILED:'실행 실패',SETUP_REQUIRED:'서버 잠금',SKIPPED:'중복 방지'};

const time=value=>`${String(Math.floor(Number(value)/60)).padStart(2,'0')}:${String(Number(value)%60).padStart(2,'0')}`;
const minute=value=>{const [hour,minutes]=String(value||'00:00').split(':').map(Number);return hour*60+minutes;};
const when=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'아직 실행 전';

export default function KeywordBidSchedulePanel({adgroupId,adgroupName='',rules=[]}){
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState(DEFAULT);
  const [latest,setLatest]=useState(null);
  const [automationEnabled,setAutomationEnabled]=useState(false);
  const [state,setState]=useState('LOADING');
  const [notice,setNotice]=useState('');
  const enabledRules=useMemo(()=>rules.filter(item=>item.ncc_adgroup_id===adgroupId&&item.enabled===true&&item.target_rank!=null),[rules,adgroupId]);

  useEffect(()=>{
    if(!adgroupId)return undefined;
    const controller=new AbortController();setState('LOADING');setNotice('');
    fetch(`/api/naver/bid-schedules?ncc_adgroup_id=${encodeURIComponent(adgroupId)}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'스케줄을 불러오지 못했습니다.');return result;})
      .then(result=>{const saved=result.schedules?.[0];setDraft(saved?{...DEFAULT,...saved}:DEFAULT);setLatest(saved?.latest_run||null);setAutomationEnabled(result.automation_enabled===true);setState('READY');})
      .catch(error=>{if(error.name!=='AbortError'){setState('FAILED');setNotice(error.message||'스케줄을 불러오지 못했습니다.');}});
    return()=>controller.abort();
  },[adgroupId]);

  function update(field,value){setDraft(current=>({...current,[field]:value}));setNotice('');}
  function toggleDay(day){setDraft(current=>({...current,weekdays:current.weekdays.includes(day)?current.weekdays.filter(value=>value!==day):[...current.weekdays,day]}));setNotice('');}
  async function save(){
    if(state==='SAVING')return;
    if(draft.mode==='ACTIVE'&&!window.confirm(`${adgroupName||'선택 광고그룹'}의 네이버 입찰 자동 적용을 켤까요?\n\n저장된 안전선·시간·한도 안에서만 실행하고, 매번 네이버 반영값을 다시 확인합니다.`))return;
    setState('SAVING');setNotice('네이버 전용 운영 스케줄을 저장하고 있어요.');
    try{
      const payload={platform:'NAVER',ncc_adgroup_id:adgroupId,...draft,confirm_active:draft.mode==='ACTIVE'};
      const response=await fetch('/api/naver/bid-schedules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'스케줄을 저장하지 못했습니다.');
      setDraft({...DEFAULT,...result.schedule});setLatest(result.schedule.latest_run||latest);setAutomationEnabled(result.automation_enabled===true);setState('READY');
      setNotice(result.schedule.mode==='ACTIVE'?(result.automation_enabled?'자동 적용을 켰어요. 다음 스케줄부터 안전조건을 확인합니다.':'스케줄은 저장했지만 서버 자동적용 잠금이 켜져 있어 아직 실제 변경하지 않습니다.'):
        result.schedule.mode==='OBSERVE'?'관찰만 저장했어요. 입찰가는 바꾸지 않고 예상 결과만 기록합니다.':'스케줄을 정지했어요.');
    }catch(error){setState('FAILED');setNotice(error.message||'스케줄을 저장하지 못했습니다.');}
  }

  const mode=MODE_COPY[draft.mode]||MODE_COPY.PAUSED;
  return <section className={`bidScheduleCard mode-${String(draft.mode).toLowerCase()} ${open?'open':''}`}>
    <button type="button" className="bidScheduleSummary" onClick={()=>setOpen(value=>!value)} aria-expanded={open}>
      <i><HarinIcon name="clock" size={21}/></i><span><small>24-4 · NAVER SCHEDULE</small><b>자동입찰 운영 시간</b><em>{adgroupName||adgroupId}</em></span>
      <strong>{state==='LOADING'?'불러오는 중':state==='FAILED'?'확인 필요':mode[0]}</strong><span className="bidScheduleChevron">⌄</span>
    </button>
    {open?<div className="bidScheduleBody">
      <header><div><b>광고그룹별로 따로 운영해요</b><p>네이버 예상 입찰가를 참고해 한 번에 한 단계만 움직입니다. 쿠팡 키워드와 API는 들어오지 않습니다.</p></div><span><HarinIcon name="shield" size={17}/>안전설정 {enabledRules.length}개</span></header>
      <div className="bidScheduleModes">{Object.entries(MODE_COPY).map(([value,copy])=><button type="button" key={value} className={draft.mode===value?'active':''} onClick={()=>update('mode',value)}><i><HarinIcon name={value==='PAUSED'?'warning':value==='OBSERVE'?'search':'sync'} size={19}/></i><span><b>{copy[0]}</b><small>{copy[1]}</small></span></button>)}</div>
      <div className="bidScheduleDays">{DAYS.map(([label,value])=><button type="button" key={value} className={draft.weekdays.includes(value)?'active':''} onClick={()=>toggleDay(value)}>{label}</button>)}</div>
      <div className="bidScheduleFields">
        <label><span>시작</span><input type="time" step="1800" value={time(draft.start_minute)} onChange={event=>update('start_minute',minute(event.target.value))}/></label>
        <label><span>종료</span><input type="time" step="1800" value={time(draft.end_minute)} onChange={event=>update('end_minute',minute(event.target.value))}/></label>
        <label><span>확인 주기</span><select value={draft.interval_minutes} onChange={event=>update('interval_minutes',Number(event.target.value))}>{[30,60,120,180].map(value=><option value={value} key={value}>{value<60?`${value}분`:`${value/60}시간`}</option>)}</select></label>
        <label><span>회당 한도</span><select value={draft.max_changes_per_run} onChange={event=>update('max_changes_per_run',Number(event.target.value))}>{[1,2,3,5,10].map(value=><option value={value} key={value}>{value}개</option>)}</select></label>
        <label><span>하루 한도</span><select value={draft.daily_change_limit} onChange={event=>update('daily_change_limit',Number(event.target.value))}>{[1,3,6,10,20,30].map(value=><option value={value} key={value}>{value}개</option>)}</select></label>
      </div>
      <label className="bidScheduleIncrease"><input type="checkbox" checked={draft.allow_increase} onChange={event=>update('allow_increase',event.target.checked)}/><span><b>자동 인상도 허용</b><small>기본은 꺼짐입니다. 켜도 상품 연결·원가·최신자료·네이버 현재값을 모두 통과해야 합니다.</small></span></label>
      <div className="bidScheduleGuard"><i><HarinIcon name="target" size={19}/></i><span><b>목표 순위는 실제 순위가 아니라 예상 기준이에요</b><small>네이버 공식 PC·모바일 목표 순위 예상값 중 높은 금액을 참고하고, 저장한 인상·인하 폭만큼만 움직입니다.</small></span><em>{automationEnabled?'서버 실행 준비':'서버 적용 잠금'}</em></div>
      <footer><span><b>{latest?RUN_LABEL[latest.status]||latest.status:'아직 실행 전'}</b><small>{latest?`${when(latest.finished_at||latest.started_at)} · 계획 ${latest.planned_count||0} / 적용 ${latest.executed_count||0} / 차단 ${latest.blocked_count||0}`:'저장 후 선택한 시간부터 실행 여부를 확인합니다.'}</small></span><button type="button" onClick={save} disabled={state==='SAVING'||!draft.weekdays.length}>{state==='SAVING'?'저장 중…':'운영 스케줄 저장'}</button></footer>
      {notice?<p className="bidScheduleNotice" role="status">{notice}</p>:null}
    </div>:null}
  </section>;
}
