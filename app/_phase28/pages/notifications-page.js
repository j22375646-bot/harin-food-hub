'use client';

import {useMemo,useState} from 'react';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './notifications-page.css';

const FILTERS=[
  {id:'OPEN',label:'열림'},
  {id:'SNOOZED',label:'1시간 숨김'},
  {id:'ACKNOWLEDGED',label:'확인'},
  {id:'RESOLVED',label:'해결'},
  {id:'ALL',label:'전체'}
];
const STATE_LABEL={OPEN:'열림',SNOOZED:'1시간 숨김',ACKNOWLEDGED:'확인',RESOLVED:'해결'};
const SEVERITY_LABEL={ERROR:'높음',WARNING:'주의',INFO:'안내'};
const ACTION_STATE={SNOOZE:'SNOOZED',ACKNOWLEDGE:'ACKNOWLEDGED',RESOLVE:'RESOLVED',REOPEN:'OPEN'};
const DEFAULT_FLOW=[
  {id:'detect',step:'01',label:'발견',value:'운영 신호 확인 필요',description:'채널·작업·자료 상태'},
  {id:'inspect',step:'02',label:'확인',value:'근거를 먼저 봐요',description:'발생 시각·영향 범위'},
  {id:'handle',step:'03',label:'처리',value:'조치 수 확인 필요',description:'숨김·확인·해결'},
  {id:'record',step:'04',label:'기록',value:'상태 이력 보존',description:'외부 발송은 별도 설정'}
];

function ChannelMark({alert}){
  if(['NAVER','CAFE24','COUPANG'].includes(alert.platform))return <Phase28ChannelLogo brand={alert.platform}/>;
  return <span className="notiChannelIcon"><HarinIcon name={alert.platform==='EPOST'?'truck':'alerts'} size={21}/></span>;
}

function SignalLine({flow=[]}){
  const icons=['radar','search','checklist','document'];
  return <section className="notiSignalLine" aria-label="알림 처리 흐름">{flow.map((item,index)=><article key={item.id}><span className="notiSignalIcon"><HarinIcon name={icons[index]} size={23}/></span><span><small>{item.step} · {item.label}</small><strong>{item.value}</strong><b>{item.description}</b></span>{index<flow.length-1?<i aria-hidden="true">›</i>:null}</article>)}</section>;
}

function AlertRow({alert,active,checked,onSelect,onCheck}){
  return <article className="notiRow" data-selected={active} data-state={alert.state}>
    <label className="notiCheck"><input type="checkbox" checked={checked} onChange={event=>onCheck(alert.id,event.target.checked)}/><span className="srOnly">{alert.title} 선택</span></label>
    <button type="button" className="notiRowButton" onClick={()=>onSelect(alert.id)} aria-pressed={active}>
      <span className="notiIdentity"><ChannelMark alert={alert}/><span><strong>{alert.channel}</strong><small>{alert.source} · {alert.timeLabel}</small></span></span>
      <span className="notiMessage"><strong>{alert.title}</strong><small>{alert.message}</small></span>
      <em data-severity={alert.severity}>{alert.state==='SNOOZED'?'1시간 숨김':alert.state==='OPEN'?SEVERITY_LABEL[alert.severity]:STATE_LABEL[alert.state]}</em>
      <i aria-hidden="true">›</i>
    </button>
  </article>;
}

function DeliverySettings({detailsCache,form,setForm,busy,onLoad,onSave,onSend,openCount}){
  const details=detailsCache.data;
  return <div className="notiDeliveryStack">
    <details onToggle={event=>{if(event.currentTarget.open)onLoad();}}>
      <summary><span><small>DELIVERY SETTING</small><strong>외부 알림 설정</strong></span><b>{detailsCache.loading?'불러오는 중':details?details.email_writes_unlocked?'발송 가능':'발송 잠금':'필요할 때 열기'}</b></summary>
      <div className="notiDeliveryBody">
        {detailsCache.error?<p className="notiInlineError">{detailsCache.error}</p>:null}
        {form?<form onSubmit={onSave}>
          <label><span>보고서 수신 이메일</span><input type="email" value={form.recipient_email||''} onChange={event=>setForm({...form,recipient_email:event.target.value})} placeholder="owner@example.com"/></label>
          <label className="notiSwitch"><input type="checkbox" checked={Boolean(form.email_enabled)} onChange={event=>setForm({...form,email_enabled:event.target.checked})}/><span><b>이메일 자동 발송</b><small>설정과 서버 안전 스위치가 모두 켜져야 발송해요.</small></span></label>
          <div className="notiSettingChecks">
            <label><input type="checkbox" checked={Boolean(form.instant_alert_enabled)} onChange={event=>setForm({...form,instant_alert_enabled:event.target.checked})}/>중요 이상징후 즉시</label>
            <label><input type="checkbox" checked={Boolean(form.daily_report_enabled)} onChange={event=>setForm({...form,daily_report_enabled:event.target.checked})}/>일일 보고서</label>
            <label><input type="checkbox" checked={Boolean(form.weekly_report_enabled)} onChange={event=>setForm({...form,weekly_report_enabled:event.target.checked})}/>주간 보고서</label>
            <label><input type="checkbox" checked={Boolean(form.monthly_report_enabled)} onChange={event=>setForm({...form,monthly_report_enabled:event.target.checked})}/>월간 보고서</label>
          </div>
          <label><span>즉시 발송 최소 중요도</span><select value={form.minimum_severity||'ERROR'} onChange={event=>setForm({...form,minimum_severity:event.target.value})}><option value="ERROR">오류만</option><option value="WARNING">경고 이상</option><option value="INFO">전체</option></select></label>
          <button type="submit" disabled={busy==='SAVE'}>{busy==='SAVE'?'저장 중…':'설정 저장'}</button>
        </form>:detailsCache.loading?<p>설정을 불러오는 중입니다.</p>:null}
        {details?<section className="notiProviderState"><span><b>Resend 이메일</b><small>{details.email_provider_configured?'공급자 설정됨':'설정 필요'} · {details.email_writes_unlocked?'쓰기 허용':'쓰기 잠금'}</small></span><span><b>Telegram</b><small>{details.telegram_provider_configured?'공급자 설정됨':'설정 필요'} · {details.telegram_writes_unlocked?'쓰기 허용':'쓰기 잠금'}</small></span></section>:null}
        <button type="button" className="notiSendButton" disabled={Boolean(busy)||!openCount} onClick={onSend}>열린 중요 알림 발송</button>
      </div>
    </details>
    <details onToggle={event=>{if(event.currentTarget.open)onLoad();}}>
      <summary><span><small>DELIVERY LOG</small><strong>외부 발송 이력</strong></span><b>{details?`${details.deliveries?.length||0}건`:'기본 접힘'}</b></summary>
      <div className="notiDeliveryBody">
        {(details?.deliveries||[]).map(item=><article className="notiDeliveryRow" key={item.id}><span><strong>{item.subject||'제목 확인 필요'}</strong><small>{item.event_type} · {item.channel||'EMAIL'} · {item.sent_at||item.attempted_at||'시각 확인 필요'}</small></span><em data-status={item.status}>{item.status}</em>{item.error_message?<p>{item.error_message}</p>:null}</article>)}
        {details&&!details.deliveries?.length?<p>아직 외부 발송 시도가 없습니다.</p>:null}
        {!details&&detailsCache.loading?<p>발송 이력을 불러오는 중입니다.</p>:null}
      </div>
    </details>
  </div>;
}

function AlertDetail({alert,busy,onAction,detailsProps}){
  if(!alert)return <div className="notiDetail notiDetailEmpty"><span><HarinIcon name="alerts" size={26}/></span><strong>이 상태의 알림이 없습니다.</strong><p>다른 필터를 선택하면 처리 기록을 확인할 수 있어요.</p></div>;
  const actions=alert.state==='RESOLVED'?[['REOPEN','다시 열기']]:alert.state==='ACKNOWLEDGED'?[['RESOLVE','해결로 표시']]:[['SNOOZE','1시간 숨김'],['ACKNOWLEDGE','확인 기록'],['RESOLVE','해결로 표시']];
  return <div className="notiDetail"><header><div><span>ALERT DETAIL</span><h2>{alert.title}</h2><p>{alert.channel} · {alert.source} · {alert.timeLabel}</p></div><em data-severity={alert.severity}>{alert.state==='OPEN'?SEVERITY_LABEL[alert.severity]:STATE_LABEL[alert.state]}</em></header><section><span>왜 표시됐나요?</span><p>{alert.message}</p></section><dl><div><dt>영향 채널</dt><dd>{alert.channel}</dd></div><div><dt>자료 종류</dt><dd>{alert.source}</dd></div><div><dt>발생 시각</dt><dd>{alert.createdAt||'확인 필요'}</dd></div><div><dt>현재 상태</dt><dd>{STATE_LABEL[alert.state]}</dd></div></dl><div className="notiDetailActions">{actions.map(([action,label])=><button type="button" data-primary={action==='RESOLVE'} disabled={Boolean(busy)} onClick={()=>onAction(alert.id,action)} key={action}>{busy===alert.id?'처리 중…':label}</button>)}</div><DeliverySettings {...detailsProps}/><p className="notiFootnote">허브 상태 변경과 외부 발송은 분리하며, 발송 전 한 번 더 확인합니다.</p></div>;
}

export default function Phase28NotificationsPage({model={}}){
  const [alerts,setAlerts]=useState(model.alerts||[]);
  const [filter,setFilter]=useState('OPEN');
  const [activeId,setActiveId]=useState(model.alerts?.[0]?.id||'');
  const [selected,setSelected]=useState([]);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [detailsCache,setDetailsCache]=useState({data:null,loading:false,error:''});
  const [form,setForm]=useState(null);
  const visible=useMemo(()=>filter==='ALL'?alerts:alerts.filter(item=>item.state===filter),[alerts,filter]);
  const active=visible.find(item=>item.id===activeId)||visible[0]||null;
  const count=state=>alerts.filter(item=>item.state===state).length;
  const currentCount=alerts.filter(item=>item.state!=='RESOLVED').length;
  const openCount=count('OPEN');
  const counts={OPEN:openCount,SNOOZED:count('SNOOZED'),ACKNOWLEDGED:count('ACKNOWLEDGED'),RESOLVED:count('RESOLVED'),ALL:alerts.length};
  const dataUnavailable=model.dataStatus==='ERROR'||Boolean(model.error);

  function toggleSelected(id,checked){setSelected(current=>checked?[...new Set([...current,id])]:current.filter(value=>value!==id));}
  function mergeAction(id,action,payload){
    const nextState=ACTION_STATE[action];
    setAlerts(current=>current.map(item=>item.id===id?{...item,state:nextState,stateLabel:STATE_LABEL[nextState],snoozedUntil:payload?.snoozed_until||null,acknowledgedAt:payload?.acknowledged_at||null,resolvedAt:payload?.resolved_at||null}:item));
  }
  async function requestUpdate(id,action){
    const response=await fetch(`/api/alerts/${encodeURIComponent(id)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});
    const payload=await response.json();
    if(!response.ok||!payload.ok)throw new Error(payload.error||'알림 상태를 바꾸지 못했습니다.');
    mergeAction(id,action,payload.alert);
  }
  async function runAction(id,action){
    setBusy(id);setMessage('');
    try{await requestUpdate(id,action);setMessage(`알림을 '${STATE_LABEL[ACTION_STATE[action]]}' 상태로 기록했습니다.`);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}
  }
  async function runBulk(action){
    const eligible=item=>action==='RESOLVE'?item.state!=='RESOLVED':['OPEN','SNOOZED'].includes(item.state);
    const candidates=alerts.filter(item=>selected.includes(item.id)&&eligible(item));
    if(!candidates.length){setMessage('선택 항목 중 처리할 수 있는 알림이 없습니다.');return;}
    if(!window.confirm(`선택 알림 ${candidates.length}건을 '${STATE_LABEL[ACTION_STATE[action]]}' 처리할까요?`))return;
    setBusy(`BULK-${action}`);const failed=[];
    for(const item of candidates){try{await requestUpdate(item.id,action);}catch{failed.push(item.id);}}
    setSelected(failed);setMessage(failed.length?`완료 ${candidates.length-failed.length}건 · 실패 ${failed.length}건`:`선택 알림 ${candidates.length}건을 처리했습니다.`);setBusy('');
  }
  async function loadDeliveryDetails(force=false){
    if(!force&&(detailsCache.data||detailsCache.loading))return;
    setDetailsCache({data:null,loading:true,error:''});
    try{const response=await fetch('/api/notifications/settings');const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'외부 알림 설정을 불러오지 못했습니다.');setDetailsCache({data:payload,loading:false,error:''});setForm(payload.settings);}catch(error){setDetailsCache({data:null,loading:false,error:error.message});}
  }
  async function saveSettings(event){
    event.preventDefault();if(!window.confirm('알림 전달 설정을 저장할까요?'))return;
    setBusy('SAVE');
    try{const response=await fetch('/api/notifications/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'알림 설정을 저장하지 못했습니다.');setForm(payload.settings);setDetailsCache(current=>({...current,data:{...current.data,settings:payload.settings}}));setMessage('알림 전달 설정을 저장했습니다.');}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}
  }
  async function sendAlerts(){
    if(!window.confirm('열린 중요 알림을 외부 알림 채널로 발송할까요? 서버 안전 스위치가 잠겨 있으면 발송하지 않습니다.'))return;
    setBusy('SEND');
    try{const response=await fetch('/api/notifications/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'ALERTS'})});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.delivery?.reason||payload.delivery?.error||payload.error||'외부 알림을 발송하지 못했습니다.');setMessage('외부 알림 발송 결과를 기록했습니다.');setDetailsCache({data:null,loading:false,error:''});await loadDeliveryDetails(true);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}
  }

  const detailsProps={detailsCache,form,setForm,busy,onLoad:loadDeliveryDetails,onSave:saveSettings,onSend:sendAlerts,openCount};
  return <section className="notiPage" data-phase28-root="true" data-phase28-page="notifications">
    <Phase28PageHeading context={`열린 알림 ${model.summary?.open==null?'확인 필요':`${openCount}건`} · 숨김 ${model.summary?.snoozed==null?'확인 필요':`${counts.SNOOZED}건`} · 마지막 신호 ${model.lastSignalLabel||'확인 필요'}`} title="지금 확인할 운영 " accent={`알림은 ${model.summary?.current==null?'확인 필요':`${currentCount}건`}`} suffix="이에요." summary="채널 오류와 데이터 품질 신호를 한곳에서 보고, 확인·숨김·해결 기록과 외부 전달 설정을 분리해 관리합니다."/>
    {model.error?<div className="notiPageError" role="alert"><HarinIcon name="warning" size={22}/><span><strong>알림 목록을 불러오지 못했습니다.</strong><small>{model.error} · 알림 수를 0건으로 표시하지 않습니다.</small></span></div>:null}
    <SignalLine flow={model.flow?.length?model.flow:DEFAULT_FLOW}/>
    {message?<div className="notiToast" role="status">{message}</div>:null}
    <Phase28RightRailLayout label="알림 상세 작업석" rail={<AlertDetail alert={active} busy={busy} onAction={runAction} detailsProps={detailsProps}/> }>
      <section className="notiWorkbench" aria-label="운영 알림 목록">
        <header className="notiToolbar"><div role="tablist" aria-label="알림 상태 필터">{FILTERS.map(item=><button type="button" role="tab" aria-selected={filter===item.id} data-selected={filter===item.id} onClick={()=>setFilter(item.id)} key={item.id}>{item.label} {dataUnavailable?'확인 필요':counts[item.id]}</button>)}</div><span>현재 조건 {dataUnavailable?'확인 필요':`${visible.length}건`}</span></header>
        <section className="notiBulk"><strong>{selected.length}건 선택</strong><span>허브 안의 알림 상태만 바꿉니다.</span><div><button type="button" disabled={!selected.length||Boolean(busy)} onClick={()=>runBulk('SNOOZE')}>1시간 숨김</button><button type="button" disabled={!selected.length||Boolean(busy)} onClick={()=>runBulk('ACKNOWLEDGE')}>확인</button><button type="button" disabled={!selected.length||Boolean(busy)} onClick={()=>runBulk('RESOLVE')}>해결</button></div></section>
        <div className="notiList">{visible.map(alert=><AlertRow alert={alert} active={active?.id===alert.id} checked={selected.includes(alert.id)} onSelect={setActiveId} onCheck={toggleSelected} key={alert.id}/>)}{!visible.length?<div className="notiEmpty"><HarinIcon name={dataUnavailable?'warning':'checklist'} size={25}/><strong>{dataUnavailable?'알림 목록을 확인할 수 없습니다.':'이 상태의 알림이 없습니다.'}</strong><p>{dataUnavailable?'저장소 연결을 확인한 뒤 다시 불러와 주세요.':'새 신호가 들어오면 수집 근거와 함께 표시합니다.'}</p></div>:null}</div>
      </section>
    </Phase28RightRailLayout>
  </section>;
}
