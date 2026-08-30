'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './calendar-page.css';

const WEEKDAYS=['일','월','화','수','목','금','토'];
const EMPTY_FORM={type:'SCHEDULE',title:'',body:'',date:'',time:'',priority:'NORMAL'};
const PRIORITY_LABEL={LOW:'여유',NORMAL:'보통',HIGH:'중요'};

function addDays(dateKey,days){const date=new Date(`${dateKey}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
function monthRange(month){
  const first=`${month}-01`,date=new Date(`${first}T00:00:00Z`),start=addDays(first,-date.getUTCDay());
  const next=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));
  const last=new Date(next.getTime()-86400000).toISOString().slice(0,10),end=addDays(last,6-new Date(`${last}T00:00:00Z`).getUTCDay());
  return {start,end};
}
function moveMonth(month,amount){const [year,value]=month.split('-').map(Number);return new Date(Date.UTC(year,value-1+amount,1)).toISOString().slice(0,7);}
function monthLabel(month){const [year,value]=month.split('-').map(Number);return `${year}년 ${value}월`;}
function fullDateLabel(date){return new Intl.DateTimeFormat('ko-KR',{timeZone:'UTC',month:'long',day:'numeric',weekday:'long'}).format(new Date(`${date}T00:00:00Z`));}
function sortEntries(entries){return [...entries].sort((a,b)=>`${a.date} ${a.time||'00:00'} ${a.title}`.localeCompare(`${b.date} ${b.time||'00:00'} ${b.title}`,'ko'));}
function calendarEntryTone(entry){
  if(entry.type==='MEMO')return 'AMBER';
  const palette=['BLUE','CORAL','MINT','VIOLET'];
  const seed=String(entry.id||entry.title||'').split('').reduce((total,letter)=>total+letter.charCodeAt(0),0);
  return palette[seed%palette.length];
}

function CalendarRail({selectedDate,entries,editing,onEdit,onCancel,onSaved,onRemoved}){
  const [form,setForm]=useState({...EMPTY_FORM,date:selectedDate});
  const [working,setWorking]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    if(editing)setForm({type:editing.type,title:editing.title,body:editing.body||'',date:editing.date,time:editing.time||'',priority:editing.priority||'NORMAL'});
    else setForm(current=>({...EMPTY_FORM,type:current.type,date:selectedDate}));
    setError('');setMessage('');
  },[editing,selectedDate]);
  const update=event=>setForm(current=>({...current,[event.target.name]:event.target.value}));
  async function request(payload){
    const response=await fetch('/api/calendar/entries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'캘린더 요청을 처리하지 못했습니다.');
    return data;
  }
  async function save(event){
    event.preventDefault();if(working)return;
    setWorking('save');setError('');setMessage('');
    try{
      const data=await request({...form,action:editing?'UPDATE_ENTRY':'CREATE_ENTRY',id:editing?.id});
      onSaved(data.entry,Boolean(editing));setMessage(editing?'수정한 내용을 저장했어요.':'새 항목을 저장했어요.');
      if(!editing)setForm(current=>({...EMPTY_FORM,type:current.type,date:form.date}));
    }catch(cause){setError(cause.message);}finally{setWorking('');}
  }
  async function remove(){
    if(!editing||working||!window.confirm(`“${editing.title}” 항목을 캘린더에서 삭제할까요?`))return;
    setWorking('delete');setError('');
    try{await request({action:'ARCHIVE_ENTRY',id:editing.id});onRemoved(editing.id);setMessage('캘린더에서 삭제했어요.');}
    catch(cause){setError(cause.message);}finally{setWorking('');}
  }
  return <div className="calendarRail">
    <section className="calendarRailSummary">
      <span>SELECTED DAY</span><h2>{fullDateLabel(selectedDate)}</h2>
      <p>{entries.length?`${entries.length}개의 일정과 메모가 있어요.`:'아직 저장된 일정이나 메모가 없어요.'}</p>
      <div><b>{entries.filter(item=>item.type==='SCHEDULE').length}<small>일정</small></b><b>{entries.filter(item=>item.type==='MEMO').length}<small>메모</small></b><b>{entries.filter(item=>item.status==='DONE').length}<small>완료</small></b></div>
    </section>
    <form className="calendarComposer" onSubmit={save}>
      <header><div><span>{editing?'EDIT ENTRY':'QUICK ADD'}</span><h3>{editing?'선택한 항목 수정':'일정 또는 메모 입력'}</h3></div>{editing?<button type="button" onClick={onCancel}>수정 취소</button>:null}</header>
      <div className="calendarTypeSwitch" aria-label="항목 종류">
        <button type="button" data-selected={form.type==='SCHEDULE'} onClick={()=>setForm(current=>({...current,type:'SCHEDULE'}))}><HarinIcon name="clock" size={18}/>일정</button>
        <button type="button" data-selected={form.type==='MEMO'} onClick={()=>setForm(current=>({...current,type:'MEMO',time:''}))}><HarinIcon name="note" size={18}/>메모</button>
      </div>
      <label><span>제목</span><input name="title" value={form.title} onChange={update} maxLength={160} placeholder={form.type==='MEMO'?'기억할 내용을 적어주세요':'일정 이름을 적어주세요'} required/></label>
      <div className="calendarFormRow"><label><span>날짜</span><input name="date" type="date" value={form.date} onChange={update} required/></label>{form.type==='SCHEDULE'?<label><span>시간 <small>선택</small></span><input name="time" type="time" value={form.time} onChange={update}/></label>:null}</div>
      <label><span>중요도</span><select name="priority" value={form.priority} onChange={update}><option value="LOW">여유</option><option value="NORMAL">보통</option><option value="HIGH">중요</option></select></label>
      <label><span>상세 메모 <small>선택</small></span><textarea name="body" value={form.body} onChange={update} maxLength={4000} rows={5} placeholder="준비물, 연락처, 확인할 내용을 함께 적을 수 있어요."/></label>
      {error?<p className="calendarFormError" role="alert">{error}</p>:null}
      {message?<p className="calendarFormMessage" role="status">{message}</p>:null}
      <button className="calendarSave" type="submit" disabled={Boolean(working)}>{working==='save'?'저장 중…':editing?'수정 내용 저장':'캘린더에 저장'}</button>
      {editing?<button className="calendarDelete" type="button" onClick={remove} disabled={Boolean(working)}>{working==='delete'?'삭제 중…':'이 항목 삭제'}</button>:null}
    </form>
    <section className="calendarStorageNote"><HarinIcon name="checklist" size={20}/><div><strong>서버에 안전하게 저장해요.</strong><p>일정과 메모는 다른 기기에서도 다시 볼 수 있고, 오늘 항목은 메인 화면에 자동으로 연결됩니다.</p></div></section>
  </div>;
}

export default function Phase28CalendarPage({model={}}){
  const today=model.today||new Date().toISOString().slice(0,10);
  const [month,setMonth]=useState(model.range?.month||today.slice(0,7));
  const [selectedDate,setSelectedDate]=useState(today);
  const [entries,setEntries]=useState(sortEntries(model.entries||[]));
  const [editing,setEditing]=useState(null);
  const [loading,setLoading]=useState(false);
  const [loadError,setLoadError]=useState(model.error||'');
  const loadedMonths=useRef(new Set(model.range?.month?[model.range.month]:[]));
  const range=useMemo(()=>monthRange(month),[month]);
  const days=useMemo(()=>Array.from({length:Math.round((new Date(`${range.end}T00:00:00Z`)-new Date(`${range.start}T00:00:00Z`))/86400000)+1},(_,index)=>addDays(range.start,index)),[range]);
  const byDate=useMemo(()=>entries.reduce((map,item)=>{if(!map[item.date])map[item.date]=[];map[item.date].push(item);return map;},{}),[entries]);
  const selectedEntries=byDate[selectedDate]||[];
  const monthEntries=entries.filter(item=>item.date?.startsWith(month));

  useEffect(()=>{
    if(loadedMonths.current.has(month))return;
    let active=true;setLoading(true);setLoadError('');
    fetch(`/api/calendar/entries?from=${range.start}&to=${range.end}`,{cache:'no-store'})
      .then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||'캘린더를 불러오지 못했습니다.');return data;})
      .then(data=>{if(!active)return;setEntries(current=>sortEntries([...current.filter(item=>item.date<range.start||item.date>range.end),...(data.entries||[])]));loadedMonths.current.add(month);})
      .catch(error=>active&&setLoadError(error.message))
      .finally(()=>active&&setLoading(false));
    return()=>{active=false;};
  },[month,range.start,range.end]);

  function selectDay(date){setSelectedDate(date);setEditing(null);if(date.slice(0,7)!==month)setMonth(date.slice(0,7));}
  function changeMonth(next){setMonth(next);setSelectedDate(`${next}-01`);setEditing(null);}
  function saved(entry,wasEditing){setEntries(current=>sortEntries(wasEditing?current.map(item=>item.id===entry.id?entry:item):[...current,entry]));setSelectedDate(entry.date);setEditing(null);}
  async function toggle(entry){
    const response=await fetch('/api/calendar/entries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'TOGGLE_ENTRY',id:entry.id,done:entry.status!=='DONE'})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok){setLoadError(data.error||'완료 상태를 바꾸지 못했습니다.');return;}
    setEntries(current=>sortEntries(current.map(item=>item.id===data.entry.id?data.entry:item)));
  }

  const rail=<CalendarRail selectedDate={selectedDate} entries={selectedEntries} editing={editing} onEdit={setEditing} onCancel={()=>setEditing(null)} onSaved={saved} onRemoved={id=>{setEntries(current=>current.filter(item=>item.id!==id));setEditing(null);}}/>;
  return <section className="calendarPage" data-phase28-root="true" data-phase28-page="calendar">
    <Phase28PageHeading context={`서버 저장 · ${model.generatedAt?'최신 자료 연결':'연결 확인 필요'}`} title="한 달의 일정과 메모를 " accent="한눈에" suffix=" 봐요." summary="날짜를 눌러 일정을 정리하고, 오늘 항목은 메인 화면에서 바로 확인하세요."/>
    <div className="calendarPulse" aria-label="캘린더 요약">
      <article><span>이번 달 일정</span><strong>{monthEntries.filter(item=>item.type==='SCHEDULE').length}개</strong><small>시간 순서로 정리</small></article>
      <article><span>이번 달 메모</span><strong>{monthEntries.filter(item=>item.type==='MEMO').length}개</strong><small>날짜별 기록</small></article>
      <article><span>남은 일정</span><strong>{monthEntries.filter(item=>item.type==='SCHEDULE'&&item.status!=='DONE').length}개</strong><small>완료 전 항목</small></article>
      <article><span>오늘</span><strong>{(byDate[today]||[]).length}개</strong><small>메인 화면 자동 연결</small></article>
    </div>
    {loadError?<div className="calendarError" role="alert"><HarinIcon name="note" size={20}/><span><strong>캘린더 자료를 확인해주세요.</strong><small>{loadError}</small></span></div>:null}
    <Phase28RightRailLayout label="일정·메모 입력석" rail={rail}>
      <div className="calendarWorkspace">
        <header className="calendarToolbar"><div><button type="button" onClick={()=>changeMonth(moveMonth(month,-1))} aria-label="이전 달">‹</button><h2>{monthLabel(month)}</h2><button type="button" onClick={()=>changeMonth(moveMonth(month,1))} aria-label="다음 달">›</button></div><button type="button" onClick={()=>{setMonth(today.slice(0,7));setSelectedDate(today);setEditing(null);}}>오늘로 이동</button><span aria-live="polite">{loading?'선택한 달 불러오는 중…':'선택한 달만 가볍게 불러왔어요.'}</span></header>
        <div className="calendarMonthViewport" aria-label="월간 캘린더">
        <div className="calendarWeekdays">{WEEKDAYS.map(day=><span key={day}>{day}</span>)}</div>
        <div className="calendarGrid">{days.map(date=>{
          const items=byDate[date]||[],outside=!date.startsWith(month),selected=date===selectedDate;
          return <button type="button" key={date} className="calendarDay" data-outside={outside} data-selected={selected} data-today={date===today} onClick={()=>selectDay(date)} aria-label={`${fullDateLabel(date)} ${items.length}개`}>
            <span className="calendarDayNumber">{Number(date.slice(-2))}{date===today?<em>오늘</em>:null}</span>
            <span className="calendarDayEntries">{items.slice(0,4).map(item=><i key={item.id} data-type={item.type} data-tone={calendarEntryTone(item)} data-done={item.status==='DONE'} title={item.title}><b>{item.time|| (item.type==='MEMO'?'메모':'종일')}</b><span>{item.title}</span></i>)}{items.length>4?<small>+{items.length-4}개 더보기</small>:null}</span>
          </button>;
        })}</div>
        </div>
        <section className="calendarAgenda">
          <header><div><span>DAY AGENDA</span><h2>{fullDateLabel(selectedDate)}</h2></div><strong>{selectedEntries.length}개</strong></header>
          <div>{selectedEntries.length?selectedEntries.map(item=><article key={item.id} data-type={item.type} data-done={item.status==='DONE'}>
            <button className="calendarAgendaMain" type="button" onClick={()=>setEditing(item)}><span>{item.type==='MEMO'?<HarinIcon name="note" size={20}/>:<HarinIcon name="clock" size={20}/>}</span><div><small>{item.type==='MEMO'?'메모':item.time||'하루 종일'} · {PRIORITY_LABEL[item.priority]||'보통'}</small><strong>{item.title}</strong>{item.body?<p>{item.body}</p>:null}</div><em>수정</em></button>
            {item.type==='SCHEDULE'?<button className="calendarDone" type="button" onClick={()=>toggle(item)}>{item.status==='DONE'?'완료 취소':'완료'}</button>:null}
          </article>):<div className="calendarEmpty"><HarinIcon name="note" size={28}/><strong>이 날짜는 아직 비어 있어요.</strong><p>오른쪽 입력석에서 일정이나 메모를 바로 추가할 수 있어요.</p></div>}</div>
        </section>
      </div>
    </Phase28RightRailLayout>
  </section>;
}
