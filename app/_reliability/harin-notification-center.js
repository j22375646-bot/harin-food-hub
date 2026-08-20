'use client';

import { useEffect, useMemo, useState } from 'react';
import remainingBulkModule from '../../lib/operations/remaining-bulk-workflows.js';
import densityWorkbenchModule from '../../lib/ui/density-workbench.js';
import { useStoredState } from '../use-hub-preference.js';
import { HarinProgressiveDetails } from '../_design-system/harin-ui.js';
import { HarinBulkCheckbox, HarinBulkSelectionBar, useHarinBulkSelection } from '../_design-system/harin-bulk-selection.js';
import HarinIcon from '../_design-system/harin-icon.js';
import HarinReliabilityWorkbench from './harin-reliability-workbench.js';

const { buildAlertBulkPlan }=remainingBulkModule;
const { ALERT_PAGE_SIZES, paginateDensityRows }=densityWorkbenchModule;

function kstParts(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
}
const dateTime=value=>{
  const parts=kstParts(value);
  return parts?`${parts.year}. ${Number(parts.month)}. ${Number(parts.day)}. ${parts.hour}:${parts.minute}:${parts.second}`:'시각 확인 필요';
};
function Empty({children}){return <div className="empty">{children}</div>;}
function PanelTitle({tag,title,right}){return <div className="panelHead"><div><span className="sectionTag">{tag}</span><h2>{title}</h2></div>{right&&<span className="period">{right}</span>}</div>;}

export default function HarinNotificationCenter({ reports=[], center={}, aiPanel }) {
  const [data,setData]=useState(null),[form,setForm]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const [filter,setFilter]=useStoredState('filter:notifications','OPEN',['OPEN','SNOOZED','ACKNOWLEDGED','RESOLVED','ALL']);
  const [densityView,setDensityView]=useStoredState('notifications-density-view',{pageSize:ALERT_PAGE_SIZES[0]});
  const [alertPage,setAlertPage]=useState(1),[deliveryPage,setDeliveryPage]=useState(1),[detailAlertId,setDetailAlertId]=useState('');
  async function load(){setLoading(true);try{const response=await fetch('/api/notifications/settings');const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'알림센터 조회 실패');setData(result);setForm(result.settings);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setLoading(false);}}
  useEffect(()=>{load();},[]);
  async function save(event){event.preventDefault();setBusy('SAVE');setMessage('설정을 저장하는 중입니다.');try{const response=await fetch('/api/notifications/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'저장 실패');setForm(result.settings);setData(current=>({...current,settings:result.settings}));setMessage('알림 설정을 저장했습니다.');}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}}
  async function send(action,reportId){setBusy(action);setMessage('이메일을 발송하는 중입니다.');try{const response=await fetch('/api/notifications/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,report_id:reportId})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.delivery?.reason||result.delivery?.error||result.error||'발송 실패');setMessage('이메일 발송이 완료되었습니다.');await load();}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setBusy('');}}
  async function requestAlertUpdate(id,action){const response=await fetch(`/api/alerts/${id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'처리 실패');return result;}
  async function updateAlert(id,action){setBusy(id);try{await requestAlertUpdate(id,action);await load();return true;}catch(error){setMessage(`확인 필요 · ${error.message}`);return false;}finally{setBusy('');}}
  async function snoozeAlert(id){if(await updateAlert(id,'SNOOZE'))setMessage('알림을 1시간 동안 숨겼습니다. 휴대폰과 PC에 같은 상태로 보입니다.');}
  const alerts=useMemo(()=>data?.alerts||[],[data?.alerts]),deliveries=data?.deliveries||[],now=Date.now(),isSnoozed=item=>new Date(item.snoozed_until||0).getTime()>now;
  const shown=filter==='ALL'?alerts:filter==='SNOOZED'?alerts.filter(item=>item.status==='OPEN'&&isSnoozed(item)):alerts.filter(item=>item.status===filter&&!isSnoozed(item)),latest=reports.find(item=>item.platform==='ALL'&&item.is_latest)||reports.find(item=>item.is_latest)||reports[0];
  const alertPageSize=ALERT_PAGE_SIZES.includes(Number(densityView?.pageSize))?Number(densityView.pageSize):ALERT_PAGE_SIZES[0];
  const alertPagination=paginateDensityRows(shown,alertPage,alertPageSize,ALERT_PAGE_SIZES),deliveryPagination=paginateDensityRows(deliveries,deliveryPage,ALERT_PAGE_SIZES[1],ALERT_PAGE_SIZES);
  const detailAlert=shown.find(item=>item.id===detailAlertId)||alertPagination.items[0]||null;
  const alertSelection=useHarinBulkSelection({allIds:alerts.map(item=>item.id),filteredIds:shown.map(item=>item.id),visibleIds:alertPagination.items.map(item=>item.id)});
  useEffect(()=>{setAlertPage(1);setDetailAlertId('');},[filter,alertPageSize]);
  const bulkActions=filter==='RESOLVED'?[['REOPEN','다시 열기']]:filter==='ACKNOWLEDGED'?[['RESOLVE','해결']]:filter==='OPEN'||filter==='SNOOZED'?[['SNOOZE','1시간 숨김'],['ACKNOWLEDGE','확인'],['RESOLVE','해결']]:[['ACKNOWLEDGE','확인'],['RESOLVE','해결'],['REOPEN','다시 열기']];
  async function runBulkAlertAction(action,label){
    const plan=buildAlertBulkPlan(alerts,alertSelection.selectedIds,action);
    if(!plan.eligible.length){setMessage(`선택 항목 중 '${label}' 처리할 수 있는 알림이 없습니다.`);return;}
    const skippedText=plan.skipped.length?` 상태가 맞지 않는 ${plan.skipped.length}건은 제외됩니다.`:'';
    if(!window.confirm(`선택 알림 ${plan.eligible.length}건을 '${label}' 처리할까요?${skippedText}`))return;
    setBusy(`BULK-${action}`);setMessage(`${plan.eligible.length}건을 처리하고 있습니다…`);
    const failed=[];
    for(const item of plan.eligible){try{await requestAlertUpdate(item.id,action);}catch{failed.push(item.id);}}
    await load();
    alertSelection.replace(failed);
    const succeeded=plan.eligible.length-failed.length;
    setMessage(failed.length?`${succeeded}건 완료 · 실패 ${failed.length}건은 다시 선택해 두었습니다.`:`선택 알림 ${succeeded}건을 '${label}' 처리했습니다.`);
    setBusy('');
  }
  if(loading&&!data)return <section className="notificationLoading">알림센터를 불러오는 중입니다…</section>;
  const openCount=alerts.filter(item=>item.status==='OPEN'&&!isSnoozed(item)).length;
  return <HarinReliabilityWorkbench mode="notifications" center={center} alerts={alerts.filter(item=>!isSnoozed(item))} deliveries={deliveries} primaryLabel="최신 보고서 발송" onPrimary={()=>latest&&send('REPORT',latest.id)} primaryBusy={Boolean(busy)||!latest} aiPanel={aiPanel}>
    {message&&<div className="syncToast">{message}</div>}
    <section className="notificationActionBar"><span><b>보고서·긴급 알림 전달</b><small>운영 알림 처리와 이메일 발송 설정은 분리해 안전하게 관리합니다.</small></span><div><button className="primary" onClick={()=>send('ALERTS')} disabled={Boolean(busy)||!openCount}>열린 중요 알림 발송</button><button onClick={()=>send('TEST')} disabled={Boolean(busy)}>테스트 이메일</button></div></section>
    <section className="notificationCurrentWork" aria-label="현재 처리할 알림">
      <article className="panel alertCenter"><div className="alertCenterHead"><PanelTitle tag="IN-APP ALERT" title="이상징후·데이터 품질 알림" right={`${shown.length}건`}/><div>{['OPEN','SNOOZED','ACKNOWLEDGED','RESOLVED','ALL'].map(item=><button className={filter===item?'active':''} onClick={()=>setFilter(item)} key={item}>{({OPEN:'열림',SNOOZED:'숨김',ACKNOWLEDGED:'확인',RESOLVED:'해결',ALL:'전체'})[item]}</button>)}</div></div><HarinBulkSelectionBar className="notificationBulkSelectionBar" selectedCount={alertSelection.selectedCount} visibleCount={alertPagination.items.length} filteredCount={shown.length} visibleState={alertSelection.visibleState} filteredState={alertSelection.filteredState} onToggleVisible={checked=>alertSelection.toggleScope(alertPagination.items.map(item=>item.id),checked)} onToggleFiltered={checked=>alertSelection.toggleScope(shown.map(item=>item.id),checked)} onClear={alertSelection.clear} summary="현재 페이지 또는 필터 결과를 한 번에 선택합니다." preview="외부 이메일은 발송하지 않고 허브 안의 알림 상태만 바꿉니다. 상태가 맞지 않는 항목은 자동 제외됩니다.">{bulkActions.map(([action,label])=>{const eligible=buildAlertBulkPlan(alerts,alertSelection.selectedIds,action).eligible.length;return <button type="button" className={action==='RESOLVE'?'primary':''} disabled={!eligible||Boolean(busy)} onClick={()=>runBulkAlertAction(action,label)} key={action}>{label} {eligible?`${eligible}건`:''}</button>;})}</HarinBulkSelectionBar><div className="notificationDensityGrid"><div className="alertCenterList compact">{alertPagination.items.map(item=><article role="button" tabIndex="0" aria-pressed={detailAlert?.id===item.id} className={`${item.severity.toLowerCase()} ${alertSelection.isSelected(item.id)?'selected':''} ${detailAlert?.id===item.id?'focused':''}`} onClick={()=>setDetailAlertId(item.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setDetailAlertId(item.id);}}} key={item.id}><header><HarinBulkCheckbox checked={alertSelection.isSelected(item.id)} onChange={event=>alertSelection.toggle(item.id,event.target.checked)} label={`${item.title} 선택`}/><span>{item.platform} · {item.source_type}</span><em>{isSnoozed(item)?'1시간 숨김':item.severity}</em></header><b>{item.title}</b><p>{item.message}</p><small>{dateTime(item.created_at)} · {item.status}</small></article>)}{!shown.length&&<Empty>이 상태의 알림이 없습니다.</Empty>}</div>{detailAlert?<aside className="notificationAlertDetail"><header><span><small>ALERT DETAIL</small><b>{detailAlert.title}</b></span><em className={detailAlert.severity.toLowerCase()}>{isSnoozed(detailAlert)?'1시간 숨김':detailAlert.severity}</em></header><p>{detailAlert.message}</p><dl><div><dt>채널</dt><dd>{detailAlert.platform}</dd></div><div><dt>자료 종류</dt><dd>{detailAlert.source_type}</dd></div><div><dt>발생 시각</dt><dd>{dateTime(detailAlert.created_at)}</dd></div><div><dt>현재 상태</dt><dd>{detailAlert.status}</dd></div></dl><footer>{detailAlert.status==='OPEN'&&!isSnoozed(detailAlert)&&<button onClick={()=>snoozeAlert(detailAlert.id)} disabled={Boolean(busy)}>1시간 숨김</button>}{detailAlert.status==='OPEN'&&<button onClick={()=>updateAlert(detailAlert.id,'ACKNOWLEDGE')} disabled={Boolean(busy)}>확인</button>}{detailAlert.status!=='RESOLVED'&&<button className="resolve" onClick={()=>updateAlert(detailAlert.id,'RESOLVE')} disabled={Boolean(busy)}>해결</button>}{detailAlert.status==='RESOLVED'&&<button onClick={()=>updateAlert(detailAlert.id,'REOPEN')} disabled={Boolean(busy)}>다시 열기</button>}</footer></aside>:<aside className="notificationAlertDetail empty"><HarinIcon name="alerts" size={24}/><b>선택할 알림이 없어요</b><p>필터를 바꾸면 다른 운영 알림을 확인할 수 있습니다.</p></aside>}</div><footer className="notificationDensityPager"><label>한 페이지 <select value={alertPageSize} onChange={event=>setDensityView({...densityView,pageSize:Number(event.target.value)})}>{ALERT_PAGE_SIZES.map(size=><option value={size} key={size}>{size}개</option>)}</select></label><span>전체 {alertPagination.total}개 · {alertPagination.page}/{alertPagination.totalPages}쪽</span><div><button type="button" disabled={alertPagination.page<=1} onClick={()=>setAlertPage(value=>value-1)}>이전</button><button type="button" disabled={alertPagination.page>=alertPagination.totalPages} onClick={()=>setAlertPage(value=>value+1)}>다음</button></div></footer></article>
    </section>
    <HarinProgressiveDetails className="notificationSettingsDisclosure" eyebrow="알림 설정" title="자동 전달·수신 이메일 설정" description="설정을 바꿀 때만 열어보세요. 열린 알림 목록과 분리해 두었습니다." count={!data?.email_provider_configured?'설정 확인':data?.email_writes_unlocked?'발송 가능':'발송 잠금'} action="설정 열기">
      <article className="panel notificationSettings"><PanelTitle tag="DELIVERY SETTING" title="자동 전달 설정" right={!data?.email_provider_configured?'발송 서버 설정 필요':data?.email_writes_unlocked?'사장님 설정 후 발송 가능':'실제 발송 잠금'}/>{form&&<form onSubmit={save}><label className="emailField"><span>보고서 수신 이메일</span><input type="email" value={form.recipient_email||''} onChange={event=>setForm({...form,recipient_email:event.target.value})} placeholder="owner@example.com"/></label><label className="switchLine"><input type="checkbox" checked={form.email_enabled} onChange={event=>setForm({...form,email_enabled:event.target.checked})}/><span><b>이메일 자동 발송</b><small>사장님 설정과 서버 안전 스위치가 모두 켜져야 발송합니다.</small></span></label><div className="settingChecks"><label><input type="checkbox" checked={form.instant_alert_enabled} onChange={event=>setForm({...form,instant_alert_enabled:event.target.checked})}/>중요 이상징후 즉시</label><label><input type="checkbox" checked={form.daily_report_enabled} onChange={event=>setForm({...form,daily_report_enabled:event.target.checked})}/>일일 보고서</label><label><input type="checkbox" checked={form.weekly_report_enabled} onChange={event=>setForm({...form,weekly_report_enabled:event.target.checked})}/>주간 보고서</label><label><input type="checkbox" checked={form.monthly_report_enabled} onChange={event=>setForm({...form,monthly_report_enabled:event.target.checked})}/>월간 보고서</label></div><label className="severityField"><span>즉시 발송 최소 중요도</span><select value={form.minimum_severity} onChange={event=>setForm({...form,minimum_severity:event.target.value})}><option value="ERROR">오류만</option><option value="WARNING">경고 이상</option><option value="INFO">전체</option></select></label><button className="saveNotification" disabled={busy==='SAVE'}>{busy==='SAVE'?'저장 중…':'설정 저장'}</button></form>}<div className="providerGuide"><b>서버 환경변수</b><span>RESEND_API_KEY · REPORT_FROM_EMAIL · RESEND_ALERT_WRITES_ENABLED</span><small>세 값은 브라우저나 DB에 저장하지 않습니다. 미설정·잠금 상태에서도 인앱 알림은 정상 작동합니다.</small></div></article>
    </HarinProgressiveDetails>
    <HarinProgressiveDetails className="notificationHistoryDisclosure" eyebrow="완료 기록" title="이메일 발송 이력" description="성공·실패한 전달 기록은 현재 알림과 분리해 필요할 때만 확인합니다." count={`${deliveries.length}건`} action="기록 열기">
      <article className="panel deliveryHistory"><div className="deliveryHistoryHead"><PanelTitle tag="DELIVERY LOG" title="이메일 발송 이력" right={`${deliveries.length}건`}/><button onClick={()=>send('ALERTS')} disabled={Boolean(busy)||!openCount}>열린 중요 알림 지금 발송</button></div><div className="deliveryTable"><div className="deliveryRow head"><span>시각</span><span>종류</span><span>제목</span><span>상태</span></div>{deliveryPagination.items.map(item=><div className="deliveryRow" key={item.id}><span>{dateTime(item.sent_at||item.attempted_at)}</span><span>{item.event_type} · {item.trigger_type}</span><b>{item.subject}<small>{item.error_message||item.recipient||''}</small></b><em className={item.status.toLowerCase()}>{item.status}</em></div>)}</div>{!deliveries.length&&<Empty>아직 이메일 발송 시도가 없습니다.</Empty>}<footer className="notificationDensityPager"><span>전체 {deliveryPagination.total}개 · {deliveryPagination.page}/{deliveryPagination.totalPages}쪽</span><div><button type="button" disabled={deliveryPagination.page<=1} onClick={()=>setDeliveryPage(value=>value-1)}>이전</button><button type="button" disabled={deliveryPagination.page>=deliveryPagination.totalPages} onClick={()=>setDeliveryPage(value=>value+1)}>다음</button></div></footer></article>
    </HarinProgressiveDetails>
  </HarinReliabilityWorkbench>;
}

