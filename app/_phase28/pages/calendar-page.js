'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './calendar-page.css';

const WEEKDAYS=['일','월','화','수','목','금','토'];
const EMPTY_FORM={type:'SCHEDULE',title:'',body:'',date:'',endDate:'',time:'',priority:'NORMAL',eventColor:'CORAL',giftTiers:[]};
const PRIORITY_LABEL={LOW:'여유',NORMAL:'보통',HIGH:'중요'};
const EVENT_COLOR_LABEL={BLUE:'파랑',CORAL:'코랄',MINT:'민트',VIOLET:'보라',AMBER:'황금'};

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
function expandEntriesByDate(entries){
  return sortEntries(entries).reduce((map,item)=>{
    const endDate=item.endDate||item.date;
    for(let date=item.date,index=0;date<=endDate&&index<=366;date=addDays(date,1),index+=1){
      const weekday=new Date(`${date}T00:00:00Z`).getUTCDay();
      const starts=date===item.date||weekday===0,ends=date===endDate||weekday===6;
      const rangePosition=starts&&ends?'SINGLE':starts?'START':ends?'END':'MIDDLE';
      if(!map[date])map[date]=[];
      map[date].push({...item,rangePosition});
    }
    return map;
  },{});
}
function mergeEntries(current,incoming){
  const byId=new Map(current.map(item=>[item.id,item]));
  incoming.forEach(item=>byId.set(item.id,item));
  return sortEntries([...byId.values()]);
}
function weekendTone(date){const day=new Date(`${date}T00:00:00Z`).getUTCDay();return day===0?'SUNDAY':day===6?'SATURDAY':'';}
function calendarEntryTone(entry){
  if(entry.type==='MEMO')return 'AMBER';
  if(entry.type==='EVENT')return entry.eventColor||'CORAL';
  const palette=['BLUE','CORAL','MINT','VIOLET'];
  const seed=String(entry.id||entry.title||'').split('').reduce((total,letter)=>total+letter.charCodeAt(0),0);
  return palette[seed%palette.length];
}

function CalendarRail({selectedDate,entries,editing,onEdit,onCancel,onSaved,onRemoved}){
  const [form,setForm]=useState({...EMPTY_FORM,date:selectedDate,endDate:selectedDate});
  const [working,setWorking]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    if(editing)setForm({type:editing.type,title:editing.title,body:editing.body||'',date:editing.date,endDate:editing.endDate||editing.date,time:editing.time||'',priority:editing.priority||'NORMAL',eventColor:editing.eventColor||'CORAL',giftTiers:(editing.giftTiers||[]).map(item=>({...item}))});
    else setForm(current=>({...EMPTY_FORM,type:current.type,date:selectedDate,endDate:selectedDate}));
    setError('');setMessage('');
  },[editing,selectedDate]);
  const update=event=>{const {name,value}=event.target;setForm(current=>{
    const next={...current,[name]:value};
    if(name==='date'&&(current.type==='MEMO'||!current.endDate||current.endDate<value))next.endDate=value;
    return next;
  });};
  const addGiftTier=()=>setForm(current=>({...current,giftTiers:[...current.giftTiers,{minimumAmount:'',giftName:'',quantity:1}]}));
  const updateGiftTier=(index,key,value)=>setForm(current=>({...current,giftTiers:current.giftTiers.map((item,itemIndex)=>itemIndex===index?{...item,[key]:value}:item)}));
  const removeGiftTier=index=>setForm(current=>({...current,giftTiers:current.giftTiers.filter((_,itemIndex)=>itemIndex!==index)}));
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
      if(!editing)setForm(current=>({...EMPTY_FORM,type:current.type,date:form.date,endDate:form.date}));
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
      <p>{entries.length?`${entries.length}개의 일정·메모·이벤트가 있어요.`:'아직 저장된 항목이 없어요.'}</p>
      <div><b>{entries.filter(item=>item.type==='SCHEDULE').length}<small>일정</small></b><b>{entries.filter(item=>item.type==='MEMO').length}<small>메모</small></b><b>{entries.filter(item=>item.type==='EVENT').length}<small>이벤트</small></b><b>{entries.filter(item=>item.status==='DONE').length}<small>완료</small></b></div>
    </section>
    <form className="calendarComposer" onSubmit={save}>
      <header><div><span>{editing?'EDIT ENTRY':'QUICK ADD'}</span><h3>{editing?'선택한 항목 수정':'일정·메모·이벤트 입력'}</h3></div>{editing?<button type="button" onClick={onCancel}>수정 취소</button>:null}</header>
      <div className="calendarTypeSwitch" aria-label="항목 종류">
        <button type="button" data-selected={form.type==='SCHEDULE'} onClick={()=>setForm(current=>({...current,type:'SCHEDULE',endDate:current.endDate||current.date}))}><HarinIcon name="clock" size={18}/>일정</button>
        <button type="button" data-selected={form.type==='MEMO'} onClick={()=>setForm(current=>({...current,type:'MEMO',endDate:current.date,time:''}))}><HarinIcon name="note" size={18}/>메모</button>
        <button type="button" data-selected={form.type==='EVENT'} onClick={()=>setForm(current=>({...current,type:'EVENT',endDate:current.endDate||current.date,time:''}))}><HarinIcon name="sparkles" size={18}/>이벤트</button>
      </div>
      <label><span>제목</span><input name="title" value={form.title} onChange={update} maxLength={160} placeholder={form.type==='MEMO'?'기억할 내용을 적어주세요':form.type==='EVENT'?'예: 추석 감사 사은품 이벤트':'일정 이름을 적어주세요'} required/></label>
      {['SCHEDULE','EVENT'].includes(form.type)?<div className="calendarFormDates"><label><span>시작일</span><input name="date" type="date" value={form.date} onChange={update} required/></label><label><span>종료일</span><input name="endDate" type="date" min={form.date} value={form.endDate} onChange={update} required/></label></div>:<label><span>날짜</span><input name="date" type="date" value={form.date} onChange={update} required/></label>}
      {form.type==='SCHEDULE'?<label><span>시작 시간 <small>선택</small></span><input name="time" type="time" value={form.time} onChange={update}/></label>:null}
      {form.type==='EVENT'?<label><span>캘린더 띠 색상</span><select name="eventColor" value={form.eventColor} onChange={update}>{Object.entries(EVENT_COLOR_LABEL).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>:null}
      {form.type==='EVENT'?<section className="eventGiftSection">
        <header><div><strong>금액대별 사은품</strong><small>결제금액에 맞는 가장 높은 한 구간을 자동 선택해요.</small></div><button type="button" onClick={addGiftTier}>구간 추가</button></header>
        <div>{form.giftTiers.length?form.giftTiers.map((tier,index)=><fieldset key={index}><legend>{index+1}구간</legend><label><span>기준 금액</span><input type="number" min="1" max="100000000" step="100" value={tier.minimumAmount} onChange={event=>updateGiftTier(index,'minimumAmount',event.target.value)} placeholder="30000" required/></label><label><span>사은품</span><input value={tier.giftName} maxLength={120} onChange={event=>updateGiftTier(index,'giftName',event.target.value)} placeholder="예: 보리차 티백" required/></label><label><span>수량</span><input type="number" min="1" max="99" value={tier.quantity} onChange={event=>updateGiftTier(index,'quantity',event.target.value)} required/></label><button type="button" onClick={()=>removeGiftTier(index)} aria-label={`${index+1}구간 삭제`}>삭제</button></fieldset>):<p>사은품이 없는 안내 이벤트도 저장할 수 있어요. 사은품을 자동 판정하려면 구간을 추가하세요.</p>}</div>
      </section>:null}
      <label><span>중요도</span><select name="priority" value={form.priority} onChange={update}><option value="LOW">여유</option><option value="NORMAL">보통</option><option value="HIGH">중요</option></select></label>
      <label><span>{form.type==='EVENT'?'이벤트 안내':'상세 메모'} <small>선택</small></span><textarea name="body" value={form.body} onChange={update} maxLength={form.type==='EVENT'?2000:4000} rows={5} placeholder={form.type==='EVENT'?'고객 안내와 포장할 때 확인할 내용을 적어주세요.':'준비물, 연락처, 확인할 내용을 함께 적을 수 있어요.'}/></label>
      {error?<p className="calendarFormError" role="alert">{error}</p>:null}
      {message?<p className="calendarFormMessage" role="status">{message}</p>:null}
      <button className="calendarSave" type="submit" disabled={Boolean(working)}>{working==='save'?'저장 중…':editing?'수정 내용 저장':'캘린더에 저장'}</button>
      {editing?<button className="calendarDelete" type="button" onClick={remove} disabled={Boolean(working)}>{working==='delete'?'삭제 중…':'이 항목 삭제'}</button>:null}
    </form>
    <section className="calendarStorageNote"><HarinIcon name="checklist" size={20}/><div><strong>서버에 저장하고 자동 연결해요.</strong><p>이벤트 기간과 사은품 구간까지 저장하며, 진행 중인 이벤트는 메인 화면에 바로 반영됩니다.</p></div></section>
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
  const [holidayCalendars,setHolidayCalendars]=useState({});
  const loadedMonths=useRef(new Set());
  const range=useMemo(()=>monthRange(month),[month]);
  const days=useMemo(()=>Array.from({length:Math.round((new Date(`${range.end}T00:00:00Z`)-new Date(`${range.start}T00:00:00Z`))/86400000)+1},(_,index)=>addDays(range.start,index)),[range]);
  const byDate=useMemo(()=>expandEntriesByDate(entries),[entries]);
  const selectedEntries=byDate[selectedDate]||[];
  const monthEnd=useMemo(()=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10),[month]);
  const monthEntries=entries.filter(item=>item.date<=monthEnd&&(item.endDate||item.date)>=`${month}-01`);
  const holidayCalendar=holidayCalendars[month]||{holidays:[],ready:false,missingYears:[]};
  const holidayMap=useMemo(()=>Object.fromEntries((holidayCalendar.holidays||[]).map(item=>[item.date,item])),[holidayCalendar.holidays]);

  useEffect(()=>{
    if(loadedMonths.current.has(month))return;
    let active=true;setLoading(true);setLoadError('');
    fetch(`/api/calendar/entries?from=${range.start}&to=${range.end}`,{cache:'no-store'})
      .then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||'캘린더를 불러오지 못했습니다.');return data;})
      .then(data=>{if(!active)return;setEntries(current=>mergeEntries(current,data.entries||[]));setHolidayCalendars(current=>({...current,[month]:{holidays:data.holidays||[],ready:Boolean(data.holidayReady),missingYears:data.holidayMissingYears||[]}}));loadedMonths.current.add(month);})
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
    <Phase28PageHeading context={`서버 저장 · ${model.generatedAt?'최신 자료 연결':'연결 확인 필요'}`} title="일정과 판매 이벤트를 " accent="한눈에" suffix=" 관리해요." summary="기간과 금액대별 사은품을 저장하면 진행 중인 이벤트가 메인 화면에 자동 반영됩니다."/>
    <div className="calendarPulse" aria-label="캘린더 요약">
      <article><span>이번 달 일정</span><strong>{monthEntries.filter(item=>item.type==='SCHEDULE').length}개</strong><small>시간 순서로 정리</small></article>
      <article><span>이번 달 메모</span><strong>{monthEntries.filter(item=>item.type==='MEMO').length}개</strong><small>날짜별 기록</small></article>
      <article><span>판매 이벤트</span><strong>{monthEntries.filter(item=>item.type==='EVENT').length}개</strong><small>기간·사은품 자동 판정</small></article>
      <article><span>남은 일정</span><strong>{monthEntries.filter(item=>item.type==='SCHEDULE'&&item.status!=='DONE').length}개</strong><small>완료 전 항목</small></article>
      <article><span>휴일 기준</span><strong>{holidayCalendar.ready?'연결':loading?'확인 중':'확인 필요'}</strong><small>{holidayCalendar.ready?`공식 공휴일 ${holidayCalendar.holidays.length}일 · 주말 표시`:'주말 표시 · 공휴일 자료 확인'}</small></article>
    </div>
    {loadError?<div className="calendarError" role="alert"><HarinIcon name="note" size={20}/><span><strong>캘린더 자료를 확인해주세요.</strong><small>{loadError}</small></span></div>:null}
    <Phase28RightRailLayout label="일정·메모 입력석" rail={rail}>
      <div className="calendarWorkspace">
        <header className="calendarToolbar"><div><button type="button" onClick={()=>changeMonth(moveMonth(month,-1))} aria-label="이전 달">‹</button><h2>{monthLabel(month)}</h2><button type="button" onClick={()=>changeMonth(moveMonth(month,1))} aria-label="다음 달">›</button></div><button type="button" onClick={()=>{setMonth(today.slice(0,7));setSelectedDate(today);setEditing(null);}}>오늘로 이동</button><span aria-live="polite">{loading?'일정과 공휴일 불러오는 중…':holidayCalendar.ready?'공식 공휴일과 주말을 반영했어요.':'주말은 표시했고, 공휴일 자료는 확인이 필요해요.'}</span></header>
        <div className="calendarMonthViewport" aria-label="월간 캘린더">
        <div className="calendarWeekdays">{WEEKDAYS.map(day=><span key={day}>{day}</span>)}</div>
        <div className="calendarGrid">{days.map(date=>{
          const items=byDate[date]||[],outside=!date.startsWith(month),selected=date===selectedDate,holiday=holidayMap[date],weekend=weekendTone(date);
          return <button type="button" key={date} className="calendarDay" data-outside={outside} data-selected={selected} data-today={date===today} data-weekend={weekend} data-holiday={Boolean(holiday)} onClick={()=>selectDay(date)} aria-label={`${fullDateLabel(date)}${holiday?` ${holiday.name}`:weekend==='SUNDAY'?' 일요일':weekend==='SATURDAY'?' 토요일':''} ${items.length}개`}>
            <span className="calendarDayNumber"><b>{Number(date.slice(-2))}</b><span className="calendarDayBadges">{holiday?<em className="calendarHoliday">{holiday.name}</em>:null}{date===today?<em>오늘</em>:null}</span></span>
            <span className="calendarDayEntries">{items.slice(0,4).map(item=><i key={item.id} data-type={item.type} data-tone={calendarEntryTone(item)} data-range-position={item.rangePosition} data-done={item.status==='DONE'} title={`${item.title} · ${item.date}${item.endDate!==item.date?` ~ ${item.endDate}`:''}`}><b>{['MIDDLE','END'].includes(item.rangePosition)?'계속':item.time|| (item.type==='MEMO'?'메모':item.type==='EVENT'?'이벤트':'종일')}</b><span>{item.title}</span></i>)}{items.length>4?<small>+{items.length-4}개 더보기</small>:null}</span>
          </button>;
        })}</div>
        </div>
        <section className="calendarAgenda">
          <header><div><span>DAY AGENDA</span><h2>{fullDateLabel(selectedDate)}</h2></div><strong>{selectedEntries.length}개</strong></header>
          <div>{selectedEntries.length?selectedEntries.map(item=><article key={item.id} data-type={item.type} data-done={item.status==='DONE'}>
            <button className="calendarAgendaMain" type="button" onClick={()=>setEditing(item)}><span>{item.type==='MEMO'?<HarinIcon name="note" size={20}/>:item.type==='EVENT'?<HarinIcon name="sparkles" size={20}/>:<HarinIcon name="clock" size={20}/>}</span><div><small>{item.type==='MEMO'?'메모':item.type==='EVENT'?`이벤트 · ${item.date} ~ ${item.endDate}`:`${item.time||'하루 종일'} · ${item.date}${item.endDate!==item.date?` ~ ${item.endDate}`:''}`} · {PRIORITY_LABEL[item.priority]||'보통'}</small><strong>{item.title}</strong>{item.type==='EVENT'&&item.giftTiers?.length?<p>{item.giftTiers.map(tier=>`${Number(tier.minimumAmount).toLocaleString('ko-KR')}원 이상 ${tier.giftName} ${tier.quantity}개`).join(' · ')}</p>:item.body?<p>{item.body}</p>:null}</div><em>수정</em></button>
            {item.type==='SCHEDULE'?<button className="calendarDone" type="button" onClick={()=>toggle(item)}>{item.status==='DONE'?'완료 취소':'완료'}</button>:null}
          </article>):<div className="calendarEmpty"><HarinIcon name="note" size={28}/><strong>이 날짜는 아직 비어 있어요.</strong><p>오른쪽 입력석에서 일정이나 메모를 바로 추가할 수 있어요.</p></div>}</div>
        </section>
      </div>
    </Phase28RightRailLayout>
  </section>;
}
