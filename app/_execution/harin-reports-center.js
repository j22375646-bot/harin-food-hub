'use client';

import Link from 'next/link';
import { useState } from 'react';
import reportVersioning from '../../lib/reports/versioning.js';

const won=value=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');
const num=value=>Number(value||0);

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

function reportMetricLabel(key){
  return {score:'운영점수',cafe24Revenue:'Cafe24 매출',naverSpend:'네이버 광고비',naverRoas:'네이버 ROAS',coupangSales:'쿠팡 매출',coupangAdSpend:'쿠팡 광고비',coupangAdRoas:'쿠팡 ROAS'}[key]||key;
}

function reportMetricValue(key,value){
  if(value==null)return '-';
  if(key==='score')return `${num(value).toFixed(0)}점`;
  if(key.toLowerCase().includes('roas'))return `${num(value).toFixed(1)}%`;
  return won(value);
}

function VersionedReportList({reports}){
  const groups=reportVersioning.groupVersions(reports);
  const [open,setOpen]=useState('');
  const [historyOpen,setHistoryOpen]=useState('');
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');

  async function action(report,actionName){
    setBusy(`${report.id}-${actionName}`);setMessage('');
    try{
      const response=await fetch(`/api/reports/${report.id}/action`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:actionName})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'처리 실패');
      setMessage(actionName==='APPROVE'?'최신 보고서를 승인했습니다.':'선택한 버전을 새 최신본으로 복원했습니다.');
      setTimeout(()=>window.location.reload(),700);
    }catch(error){setMessage(`확인 필요 · ${error.message}`);setBusy('');}
  }

  async function sendReport(report){
    setBusy(`${report.id}-SEND`);setMessage('보고서를 이메일로 발송하는 중입니다.');
    try{
      const response=await fetch('/api/notifications/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'REPORT',report_id:report.id})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.delivery?.reason||result.delivery?.error||result.error||'발송 실패');
      setMessage('보고서를 설정된 이메일로 발송했습니다.');setBusy('');
    }catch(error){setMessage(`확인 필요 · ${error.message}`);setBusy('');}
  }

  return <article className="panel versionedReports">
    <PanelTitle tag="REPORT ARCHIVE" title="보고서 이력·버전관리" right={`${groups.length}개 보고서 · ${reports.length}개 버전`}/>
    {message&&<div className="reportVersionMessage">{message}</div>}
    {groups.length?<div className="reportSeriesList">{groups.map(group=>{
      const report=group.latest,summary=report.summary_json||{},previous=group.versions[1];
      const changes=previous?reportVersioning.compareVersions(report,previous):null;
      const changeRows=changes?Object.entries(changes).filter(([,item])=>item.current!=null&&item.previous!=null).slice(0,4):[];
      return <section className={`reportSeries ${open===group.key?'open':''}`} key={group.key}>
        <button className="reportSeriesHead" onClick={()=>setOpen(open===group.key?'':group.key)}>
          <div><span className={`platformBadge ${String(report.platform).toLowerCase()}`}>{report.platform}</span><b>{report.title}</b><small>{report.period_start} ~ {report.period_end} · {report.report_type}</small></div>
          <div className="reportSeriesStatus"><em className={report.approved_at?'approved':''}>{report.approved_at?'승인본':'최신본'}</em><strong>v{report.version||1}</strong><span>{group.count}개 버전</span></div>
        </button>
        {open===group.key&&<div className="reportSeriesBody">
          <section className="reportVersionKpis"><span><small>운영점수</small><b>{summary.score??'-'}점</b></span><span><small>Cafe24 매출</small><b>{summary.cafe24?won(summary.cafe24.revenue):'-'}</b></span><span><small>네이버 ROAS</small><b>{summary.naver?`${num(summary.naver.roas).toFixed(1)}%`:'-'}</b></span><span><small>쿠팡 매출</small><b>{summary.coupang?won(summary.coupang.gross_sales):'-'}</b></span></section>
          {changeRows.length>0&&<section className="versionDelta"><b>직전 버전 대비</b>{changeRows.map(([key,item])=><span key={key}><small>{reportMetricLabel(key)}</small><em className={item.delta>0?'up':item.delta<0?'down':''}>{item.delta>0?'+':''}{reportMetricValue(key,item.delta)}</em></span>)}</section>}
          <div className="reportOutputActions"><a href={`/api/reports/${report.id}/print`} target="_blank" rel="noreferrer">상세 보고서 · PDF/인쇄</a><a className="owner" href={`/api/reports/${report.id}/print?mode=owner`} target="_blank" rel="noreferrer">사장님 1페이지 · PDF/인쇄</a><a href={`/api/reports/${report.id}/download`}>HTML 저장</a><button className="emailReport" onClick={()=>sendReport(report)} disabled={Boolean(busy)}>{busy===`${report.id}-SEND`?'발송 중…':'이메일 발송'}</button>{!report.approved_at&&<button onClick={()=>action(report,'APPROVE')} disabled={Boolean(busy)}>{busy===`${report.id}-APPROVE`?'승인 중…':'최신본 승인'}</button>}</div>
          <button className="historyToggle" onClick={()=>setHistoryOpen(historyOpen===group.key?'':group.key)}>{historyOpen===group.key?'버전 이력 닫기':`과거 버전 ${group.count}개 보기`}</button>
          {historyOpen===group.key&&<div className="reportVersionTimeline">{group.versions.map(version=><div key={version.id}><span className="versionNumber">v{version.version||1}</span><section><b>{version.is_latest?'현재 최신본':version.approved_at?'당시 승인본':'보관본'}</b><small>{dateTime(version.created_at)} · {version.revision_note||'기존 보고서'}</small></section><div><a href={`/api/reports/${version.id}/print`} target="_blank" rel="noreferrer">열기</a>{!version.is_latest&&<button onClick={()=>action(version,'RESTORE')} disabled={Boolean(busy)}>{busy===`${version.id}-RESTORE`?'복원 중…':'이 버전 복원'}</button>}</div></div>)}</div>}
        </div>}
      </section>;
    })}</div>:<Empty>저장된 보고서가 없습니다.</Empty>}
  </article>;
}

function ManualAutomationButtons(){
  const [running,setRunning]=useState('');
  const [message,setMessage]=useState('');
  async function run(path,label){
    setRunning(path);setMessage(`${label} 처리 중…`);
    try{
      const response=await fetch(path,{method:'POST'});const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'실행 실패');
      setMessage(`${label} 완료`);setTimeout(()=>window.location.reload(),800);
    }catch(error){setMessage(`확인 필요 · ${error.message}`);setRunning('');}
  }
  return <section className="manualAutomation"><button onClick={()=>run('/api/reports/daily','일일 보고서·이상징후 재생성')} disabled={Boolean(running)}>{running==='/api/reports/daily'?'생성 중…':'일일 보고서 + 이상징후 재계산'}</button><Link href="/approvals">변경·복구 기록 보기</Link>{message&&<span>{message}</span>}</section>;
}

function AutomationPanel({learningHistory={}}){
  const schedule=learningHistory.schedule||{};
  const cards=[
    ['D','autoGreen','일간 보고서',schedule.daily?.when||'매일 오전 7:10','지난 7일을 매일 새로 비교'],
    ['W','autoPurple','주간 보고서',schedule.weekly?.when||'매주 월요일 오전 7:30','한 주의 매출·광고·이익 정리'],
    ['1','autoOrange','월간 잠정본',schedule.monthly_provisional?.when||'매월 1일 오전 8:00','빠른 월 마감 우선 확인'],
    ['5','autoForest','월간 확정본',schedule.monthly_final?.when||'매월 5일 오전 8:00','정산자료를 반영한 최종본']
  ];
  return <><section className="automationGrid reportScheduleGrid">{cards.map(([icon,tone,label,when,description])=><article className="automationCard" key={label}><i className={tone}>{icon}</i><div><span>{label}</span><b>{when}</b><small>{description}</small></div><em>예약</em></article>)}</section><div className="reportScheduleFoot"><span>수집이력은 데이터수집에서 확인</span><span>이 화면은 진단과 보고서 근거만 표시</span><b>OpenAI 사용 전 · 자동 호출 0회 · 비용 0원</b></div></>;
}

const learningOutcomeLabel={IMPROVED:'개선 확인',DECLINED:'악화 확인',STABLE:'큰 변화 없음',BASELINE:'첫 기준',BLOCKED:'판단 보류'};
function ReportLearningCenter({history={}}){
  const items=history.items||[],summary=history.summary||{};
  return <section className="reportLearningCenter"><header><div><span>SERVER LEARNING HISTORY</span><h2>보고서가 쌓일수록 비교 기준도 쌓여요</h2><p>AI 비용을 쓰지 않고 서버가 보고서 점수·핵심 진단·다음 행동·입찰 검증 결과를 같은 형식으로 보관합니다.</p></div><em>개인정보 없음 · 플랫폼 자동변경 없음</em></header><div className="reportLearningKpis"><span><small>학습된 보고서</small><b>{count(summary.learned)}건</b></span><span className="good"><small>개선 확인</small><b>{count(summary.improved)}건</b></span><span className="warn"><small>다시 확인</small><b>{count(summary.declined)}건</b></span><span><small>OpenAI 호출</small><b>{count(summary.openai_calls)}회</b></span></div><details className="reportLearningTimeline"><summary><span><b>학습 이력 펼쳐보기</b><small>최근 보고서 {items.length}건 · 기본은 접혀 있습니다.</small></span><em>열기</em></summary><div>{items.map(item=><article className={String(item.outcome||'baseline').toLowerCase()} key={item.id}><header><div><span>{item.platform} · {item.report_type} · v{item.version}</span><b>{item.title}</b><small>{item.period_start} ~ {item.period_end} · {dateTime(item.created_at)}</small></div><em>{learningOutcomeLabel[item.outcome]||item.outcome}</em></header><section><span><small>운영점수</small><b>{item.score==null?'확인 필요':`${item.score}점`}</b><i>{item.score_delta==null?'첫 기준':`${item.score_delta>=0?'+':''}${item.score_delta.toFixed(1)}점`}</i></span><span><small>자료 상태</small><b>{item.data_status==='READY'?'계산 가능':item.data_status==='BLOCKED'?'판단 보류':'일부 확인 필요'}</b><i>서버 계산</i></span><span><small>7·14일 검증</small><b>{count(item.bid_validation?.total)}건</b><i>개선 {count(item.bid_validation?.improved)} · 롤백검토 {count(item.bid_validation?.rollback_review)}</i></span></section>{item.observations?.length>0&&<ul>{item.observations.slice(0,2).map((observation,index)=><li key={`${item.id}-o-${index}`}><b>{observation.title}</b><span>{observation.body}</span></li>)}</ul>}{item.next_actions?.length>0&&<footer><b>다음 행동</b><span>{item.next_actions[0].title}</span></footer>}</article>)}{!items.length&&<div className="reportLearningEmpty">첫 예약 보고서가 생성되면 이곳에 학습 이력이 쌓입니다.</div>}</div></details></section>;
}

function isoDate(date){return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);}
function ReportGenerator(){
  const today=new Date();const weekAgo=new Date(today);weekAgo.setDate(today.getDate()-6);
  const [form,setForm]=useState({platform:'ALL',report_type:'WEEKLY',period_start:isoDate(weekAgo),period_end:isoDate(today)});
  const [generating,setGenerating]=useState(false);
  const [message,setMessage]=useState('');
  function change(event){setForm(current=>({...current,[event.target.name]:event.target.value}));}
  function typeChange(event){const type=event.target.value,end=new Date(),start=new Date(end);start.setDate(end.getDate()-(type==='MONTHLY'?29:6));setForm(current=>({...current,report_type:type,period_start:isoDate(start),period_end:isoDate(end)}));}
  async function generate(event){
    event.preventDefault();setGenerating(true);setMessage('주문·방문·광고 데이터를 분석하는 중이에요…');
    try{
      const response=await fetch('/api/reports/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(form)});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'생성 실패');
      setMessage(`생성 완료 · 실행결정 ${result.actions_created}건 추가`);setTimeout(()=>window.location.reload(),900);
    }catch(error){setMessage(`확인 필요 · ${error.message}`);setGenerating(false);}
  }
  return <article className="panel generatorPanel"><PanelTitle tag="AUTO REPORT" title="새 보고서 자동 생성" right="Supabase 실데이터"/><form onSubmit={generate}><label><span>플랫폼</span><select name="platform" value={form.platform} onChange={change}><option value="ALL">전체 통합</option><option value="CAFE24">Cafe24</option><option value="NAVER">네이버</option><option value="COUPANG">쿠팡</option></select></label><label><span>종류</span><select name="report_type" value={form.report_type} onChange={typeChange}><option value="WEEKLY">주간 보고서</option><option value="MONTHLY">월간 보고서</option><option value="ADHOC">수시 보고서</option></select></label><label><span>시작일</span><input name="period_start" type="date" value={form.period_start} onChange={change}/></label><label><span>종료일</span><input name="period_end" type="date" value={form.period_end} onChange={change}/></label><button type="submit" disabled={generating}>{generating?'분석 중…':'보고서 생성'}</button></form>{message&&<div className="importMessage">{message}</div>}<div className="generatorNote"><b>자동 포함 항목</b><span>종합점수 · 전기 비교 · 매출·주문·전환 · 캠페인·키워드 · 상품·유입경로 · 자동진단 · 우선순위 권고 · 실행계획</span></div></article>;
}

export default function HarinReportsCenter({reports=[],learningHistory={}}){
  return <><section className="pageIntro reportIntro phase12ReportIntro"><div><span className="eyebrow">12-8 · REPORT & LEARN</span><h1>진단목록·자동보고서</h1><p>수집 기록과 실행 버튼은 빼고, 무엇이 문제인지와 판단 근거만 확인하는 화면으로 정리했습니다.</p></div><button onClick={()=>document.querySelector('.generatorPanel')?.scrollIntoView({behavior:'smooth'})}>새 보고서 만들기</button></section><AutomationPanel learningHistory={learningHistory}/><ReportLearningCenter history={learningHistory}/><ManualAutomationButtons/><ReportGenerator/><VersionedReportList reports={reports}/></>;
}
