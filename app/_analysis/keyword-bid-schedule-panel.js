'use client';

import './keyword-bid-schedule-panel.css';
import {useEffect,useMemo,useState} from 'react';
import {HarinIcon} from '../_design-system/harin-icon.js';

const DAYS=[['월',1],['화',2],['수',3],['목',4],['금',5],['토',6],['일',0]];
const HOURS=Array.from({length:24},(_,hour)=>hour);
const DEFAULT={mode:'PAUSED',weekdays:[1,2,3,4,5],start_minute:540,end_minute:1080,interval_minutes:60,max_changes_per_run:3,daily_change_limit:6,cooldown_minutes:360,time_slots:null,allow_increase:false};
const MODE_COPY={PAUSED:['정지','아무 작업도 하지 않아요'],OBSERVE:['관찰만','예상값과 차단 사유만 기록해요'],ACTIVE:['자동 적용','안전조건을 통과한 키워드만 변경해요']};
const RUN_LABEL={OBSERVED:'관찰 완료',COMPLETED:'적용·재조회 완료',PARTIAL:'일부 확인 필요',FAILED:'실행 실패',SETUP_REQUIRED:'서버 잠금',SKIPPED:'중복 방지'};

const time=value=>`${String(Math.floor(Number(value)/60)).padStart(2,'0')}:${String(Number(value)%60).padStart(2,'0')}`;
const minute=value=>{const [hour,minutes]=String(value||'00:00').split(':').map(Number);return hour*60+minutes;};
const when=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'아직 실행 전';
const key=(weekday,hour)=>`${weekday}:${hour}`;
const emptySlot=(weekday,hour)=>({weekday,hour,enabled:false,target_rank:null,maximum_bid:null,change_step:null});
const legacySlots=draft=>(draft.weekdays||[]).flatMap(weekday=>HOURS.filter(hour=>hour*60>=draft.start_minute&&hour*60<draft.end_minute).map(hour=>({...emptySlot(weekday,hour),enabled:true})));

export default function KeywordBidSchedulePanel({adgroupId,adgroupName='',rules=[]}){
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState(DEFAULT);
  const [latest,setLatest]=useState(null);
  const [control,setControl]=useState({emergency_paused:false});
  const [selected,setSelected]=useState({weekday:1,hour:9});
  const [automationEnabled,setAutomationEnabled]=useState(false);
  const [state,setState]=useState('LOADING');
  const [controlState,setControlState]=useState('READY');
  const [notice,setNotice]=useState('');
  const enabledRules=useMemo(()=>rules.filter(item=>item.ncc_adgroup_id===adgroupId&&item.enabled===true&&item.target_rank!=null),[rules,adgroupId]);
  const effectiveSlots=useMemo(()=>Array.isArray(draft.time_slots)?draft.time_slots:legacySlots(draft),[draft]);
  const slotMap=useMemo(()=>new Map(effectiveSlots.map(item=>[key(item.weekday,item.hour),item])),[effectiveSlots]);
  const selectedSlot=slotMap.get(key(selected.weekday,selected.hour))||emptySlot(selected.weekday,selected.hour);
  const activeCount=effectiveSlots.filter(item=>item.enabled===true).length;

  useEffect(()=>{
    if(!adgroupId)return undefined;
    const controller=new AbortController();setState('LOADING');setNotice('');
    fetch(`/api/naver/bid-schedules?ncc_adgroup_id=${encodeURIComponent(adgroupId)}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'스케줄을 불러오지 못했습니다.');return result;})
      .then(result=>{const saved=result.schedules?.[0];setDraft(saved?{...DEFAULT,...saved}:DEFAULT);setLatest(saved?.latest_run||null);setControl(result.control||{emergency_paused:false});setAutomationEnabled(result.automation_enabled===true);setState('READY');})
      .catch(error=>{if(error.name!=='AbortError'){setState('FAILED');setNotice(error.message||'스케줄을 불러오지 못했습니다.');}});
    return()=>controller.abort();
  },[adgroupId]);

  function update(field,value){setDraft(current=>({...current,[field]:value}));setNotice('');}
  function toggleDay(day){setDraft(current=>({...current,weekdays:current.weekdays.includes(day)?current.weekdays.filter(value=>value!==day):[...current.weekdays,day]}));setNotice('');}
  function updateSlot(field,value){
    setDraft(current=>{
      const slots=Array.isArray(current.time_slots)?[...current.time_slots]:legacySlots(current);
      const index=slots.findIndex(item=>item.weekday===selected.weekday&&item.hour===selected.hour);
      const next={...(index>=0?slots[index]:emptySlot(selected.weekday,selected.hour)),[field]:value};
      if(index>=0)slots[index]=next;else slots.push(next);
      return {...current,time_slots:slots};
    });
    setNotice('');
  }
  function applyPreset(kind){
    if(kind==='WEEKDAY')setDraft(current=>({...current,time_slots:[1,2,3,4,5].flatMap(weekday=>HOURS.filter(hour=>hour>=9&&hour<18).map(hour=>({...emptySlot(weekday,hour),enabled:true})))}));
    if(kind==='OFF')setDraft(current=>({...current,time_slots:[]}));
    setNotice(kind==='WEEKDAY'?'평일 09~18시 시간표를 채웠어요. 저장 전까지 실제 운영에는 반영되지 않습니다.':'시간표의 모든 칸을 껐어요. 저장 전까지 실제 운영에는 반영되지 않습니다.');
  }
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
  async function toggleEmergency(){
    if(controlState==='SAVING')return;
    const pausing=!control.emergency_paused;
    if(!window.confirm(pausing?'네이버 자동입찰 전체를 지금 정지할까요?\n\n광고그룹 설정은 보존되고 서버 실행만 즉시 멈춥니다.':'네이버 자동입찰 전체 긴급정지를 해제할까요?\n\n활성 스케줄은 다음 예약 시각부터 다시 실행됩니다.'))return;
    setControlState('SAVING');
    try{
      const response=await fetch('/api/naver/bid-schedules',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({action:pausing?'EMERGENCY_PAUSE':'EMERGENCY_RESUME',reason:pausing?'사장님이 키워드 화면에서 전체 긴급 정지':''})});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'긴급정지 상태를 바꾸지 못했습니다.');
      setControl(result.control);setNotice(pausing?'네이버 자동입찰 서버 실행을 모두 정지했어요. 개별 시간표는 그대로 보존됩니다.':'전체 긴급정지를 해제했어요. 활성 시간표는 다음 예약 시각부터 다시 확인합니다.');
    }catch(error){setNotice(error.message||'긴급정지 상태를 바꾸지 못했습니다.');}
    finally{setControlState('READY');}
  }

  const mode=MODE_COPY[draft.mode]||MODE_COPY.PAUSED;
  const selectedDay=DAYS.find(([,value])=>value===selected.weekday)?.[0]||'';
  return <section className={`bidScheduleCard mode-${String(draft.mode).toLowerCase()} ${open?'open':''} ${control.emergency_paused?'emergency':''}`}>
    <button type="button" className="bidScheduleSummary" onClick={()=>setOpen(value=>!value)} aria-expanded={open}>
      <i><HarinIcon name="clock" size={21}/></i><span><small>24-5 · NAVER HOURLY GRID</small><b>요일·시간 자동입찰</b><em>{adgroupName||adgroupId}</em></span>
      <strong>{control.emergency_paused?'전체 긴급정지':state==='LOADING'?'불러오는 중':state==='FAILED'?'확인 필요':mode[0]}</strong><span className="bidScheduleChevron">⌄</span>
    </button>
    {open?<div className="bidScheduleBody">
      <header><div><b>광고그룹별로 따로 운영해요</b><p>네이버 예상 입찰가를 참고해 한 번에 한 단계만 움직입니다. 쿠팡 키워드와 API는 들어오지 않습니다.</p></div><span><HarinIcon name="shield" size={17}/>안전설정 {enabledRules.length}개</span></header>
      <div className={`bidEmergencyControl ${control.emergency_paused?'paused':''}`}><i><HarinIcon name={control.emergency_paused?'warning':'shield'} size={21}/></i><span><b>{control.emergency_paused?'전체 자동입찰이 멈춰 있어요':'서버 전체 긴급정지'}</b><small>{control.emergency_paused?`${control.paused_reason||'사장님 긴급 정지'} · 개별 시간표는 보존됨`:'문제가 생기면 모든 광고그룹 실행을 한 번에 멈춥니다.'}</small></span><button type="button" onClick={toggleEmergency} disabled={controlState==='SAVING'}>{controlState==='SAVING'?'반영 중…':control.emergency_paused?'긴급정지 해제':'전체 긴급 정지'}</button></div>
      <div className="bidScheduleModes">{Object.entries(MODE_COPY).map(([value,copy])=><button type="button" key={value} className={draft.mode===value?'active':''} onClick={()=>update('mode',value)}><i><HarinIcon name={value==='PAUSED'?'warning':value==='OBSERVE'?'search':'sync'} size={19}/></i><span><b>{copy[0]}</b><small>{copy[1]}</small></span></button>)}</div>
      <div className="bidTimeGridIntro"><span><b>요일 × 24시간</b><small>{Array.isArray(draft.time_slots)?`세부 시간표 · 운영 ${activeCount}칸`:'간단 시간 설정을 시간표로 미리 보여드려요.'}</small></span><div><button type="button" onClick={()=>applyPreset('WEEKDAY')}>평일 09~18</button><button type="button" onClick={()=>applyPreset('OFF')}>모든 칸 끄기</button><button type="button" onClick={()=>update('time_slots',null)}>간단 설정 사용</button></div></div>
      <div className="bidTimeGridScroll" role="region" aria-label="네이버 자동입찰 요일별 24시간표" tabIndex="0"><div className="bidTimeGrid"><span className="corner">시간</span>{HOURS.map(hour=><span className="hour" key={hour}>{String(hour).padStart(2,'0')}</span>)}{DAYS.flatMap(([label,weekday])=>[<b className="day" key={`day-${weekday}`}>{label}</b>,...HOURS.map(hour=>{const slot=slotMap.get(key(weekday,hour));const active=slot?.enabled===true;const chosen=weekday===selected.weekday&&hour===selected.hour;return <button type="button" key={key(weekday,hour)} className={`${active?'active':''} ${chosen?'selected':''}`} aria-label={`${label}요일 ${hour}시 ${active?'운영':'정지'}`} onClick={()=>setSelected({weekday,hour})}><span/></button>;})])}</div></div>
      <div className="bidTimeSlotEditor"><i><HarinIcon name="target" size={20}/></i><span className="title"><b>{selectedDay}요일 {String(selected.hour).padStart(2,'0')}시</b><small>비워두면 키워드별 안전설정을 그대로 사용해요.</small></span><label className="switch"><input type="checkbox" checked={selectedSlot.enabled===true} onChange={event=>updateSlot('enabled',event.target.checked)}/><span>{selectedSlot.enabled?'운영':'정지'}</span></label><label><span>목표 순위</span><select value={selectedSlot.target_rank??''} onChange={event=>updateSlot('target_rank',event.target.value?Number(event.target.value):null)}><option value="">키워드 설정</option>{[1,2,3,4,5].map(value=><option value={value} key={value}>{value}위</option>)}</select></label><label><span>최대 입찰가</span><input type="number" min="70" max="100000" step="10" value={selectedSlot.maximum_bid??''} placeholder="키워드 상한" onChange={event=>updateSlot('maximum_bid',event.target.value?Number(event.target.value):null)}/></label><label><span>변경 단위</span><input type="number" min="10" max="10000" step="10" value={selectedSlot.change_step??''} placeholder="키워드 설정" onChange={event=>updateSlot('change_step',event.target.value?Number(event.target.value):null)}/></label></div>
      <details className="bidLegacySchedule"><summary>간단 시간 설정</summary><div className="bidScheduleDays">{DAYS.map(([label,value])=><button type="button" key={value} className={draft.weekdays.includes(value)?'active':''} onClick={()=>toggleDay(value)}>{label}</button>)}</div><div className="bidScheduleFields"><label><span>시작</span><input type="time" step="1800" value={time(draft.start_minute)} onChange={event=>update('start_minute',minute(event.target.value))}/></label><label><span>종료</span><input type="time" step="1800" value={time(draft.end_minute)} onChange={event=>update('end_minute',minute(event.target.value))}/></label><label><span>확인 주기</span><select value={draft.interval_minutes} onChange={event=>update('interval_minutes',Number(event.target.value))}>{[60,120,180].map(value=><option value={value} key={value}>{value/60}시간</option>)}</select></label><label><span>회당 한도</span><select value={draft.max_changes_per_run} onChange={event=>update('max_changes_per_run',Number(event.target.value))}>{[1,2,3,5,10].map(value=><option value={value} key={value}>{value}개</option>)}</select></label><label><span>하루 한도</span><select value={draft.daily_change_limit} onChange={event=>update('daily_change_limit',Number(event.target.value))}>{[1,3,6,10,20,30].map(value=><option value={value} key={value}>{value}개</option>)}</select></label></div></details>
      <label className="bidScheduleCooldown"><i><HarinIcon name="clock" size={20}/></i><span><b>같은 키워드 변경 휴지기</b><small>입찰가를 바꾼 뒤 선택한 시간 동안은 같은 키워드를 다시 바꾸지 않아요.</small></span><select value={draft.cooldown_minutes} onChange={event=>update('cooldown_minutes',Number(event.target.value))} aria-label="같은 키워드 변경 휴지기">{[[60,'1시간'],[180,'3시간'],[360,'6시간 · 권장'],[720,'12시간'],[1440,'24시간']].map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label className="bidScheduleIncrease"><input type="checkbox" checked={draft.allow_increase} onChange={event=>update('allow_increase',event.target.checked)}/><span><b>자동 인상도 허용</b><small>기본은 꺼짐입니다. 켜도 상품 연결·원가·최신자료·네이버 현재값을 모두 통과해야 합니다.</small></span></label>
      <div className="bidScheduleGuard"><i><HarinIcon name="target" size={19}/></i><span><b>시간대 설정과 휴지기는 기존 안전선을 넓히지 않아요</b><small>시간대 최대가는 키워드 상한보다 낮을 때만 적용하고, 최근 변경된 키워드는 휴지기가 끝날 때까지 자동 차단합니다.</small></span><em>{automationEnabled?'서버 실행 준비':'서버 적용 잠금'}</em></div>
      <footer><span><b>{latest?RUN_LABEL[latest.status]||latest.status:'아직 실행 전'}</b><small>{latest?`${when(latest.finished_at||latest.started_at)} · 계획 ${latest.planned_count||0} / 적용 ${latest.executed_count||0} / 차단 ${latest.blocked_count||0}`:'저장 후 선택한 시간부터 실행 여부를 확인합니다.'}</small></span><button type="button" onClick={save} disabled={state==='SAVING'||!draft.weekdays.length}>{state==='SAVING'?'저장 중…':'요일·시간표 저장'}</button></footer>
      {notice?<p className="bidScheduleNotice" role="status">{notice}</p>:null}
    </div>:null}
  </section>;
}
