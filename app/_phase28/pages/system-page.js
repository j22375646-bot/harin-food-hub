'use client';

import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import {pushPhase28Route} from '../phase28-navigation-feedback.js';
import './system-page.css';

const WORKSPACES=[
  {id:'connections',label:'핵심 연결'},
  {id:'datasets',label:'받는 자료'},
  {id:'jobs',label:'작업·스케줄'},
  {id:'recovery',label:'오류·복구'}
];
const FLOW_LABELS=['외부 API','읽기 검증','수집 작업','Supabase 저장','허브 반영'];
const SERVICE_LABELS={cafe24:'Cafe24','naver-ads':'네이버 검색광고','naver-commerce':'네이버 커머스',coupang:'쿠팡',epost:'우체국택배',supabase:'Supabase'};
const SERVICE_META={cafe24:'자사몰 Admin API · OAuth','naver-ads':'캠페인 · 광고그룹 · 키워드','naver-commerce':'스마트스토어 운영 API · 고정 IP',coupang:'WING Open API · 서울 고정 IP',epost:'계약소포 · 운송장 · 배송조회',supabase:'운영 저장소 · 작업 큐 · 이력'};
const SERVICE_BRAND={cafe24:'CAFE24','naver-ads':'NAVER','naver-commerce':'NAVER',coupang:'COUPANG'};
const SERVICE_ICON={epost:'truck',supabase:'database'};
const JOB_LABELS={'vercel-cron':'Vercel Cron','fixed-ip':'서울 고정 IP 워커',systemd:'systemd',watchdog:'Supabase 워치독'};
const STATUS_LABEL={READY:'정상',RUNNING:'작업 중',PARTIAL:'일부 확인',STALE:'갱신 필요',FAILED:'오류 확인',SETUP_REQUIRED:'설정 필요',VERIFY_REQUIRED:'읽기 확인 필요'};
const AXIS_LABEL={configuration:'설정',read:'읽기 검증',freshness:'자료 최신성',write:'쓰기 잠금',job:'작업 상태'};
const FLOW_WORKSPACE={api:'connections',probe:'connections',job:'jobs',store:'datasets',hub:'recovery'};
const WORKSPACE_HREF={connections:'/data-collection',datasets:'/data-collection?workspace=datasets',jobs:'/data-collection?workspace=jobs',recovery:'/data-collection?workspace=recovery'};

function ServiceMark({service}){
  const brand=SERVICE_BRAND[service.id];
  if(brand)return <Phase28ChannelLogo brand={brand}/>;
  return <span className="sysServiceIcon" data-tone={service.tone}><HarinIcon name={SERVICE_ICON[service.id]||'settings'} size={22}/></span>;
}

function StatusPill({value,label}){
  const normalized=String(value||'VERIFY_REQUIRED').toUpperCase();
  return <span className="sysStatus" data-status={normalized}><i/>{label||STATUS_LABEL[normalized]||'확인 필요'}</span>;
}

function FlowRunway({flow,onStage}){
  const rows=flow?.length?flow:FLOW_LABELS.map((label,index)=>({id:['api','probe','job','store','hub'][index],label,description:'상태 확인 필요',value:'확인 필요',status:'ATTENTION'}));
  return <section className="sysFlow" aria-labelledby="sysFlowTitle"><header><div><span>CORE DATA RUNWAY</span><h2 id="sysFlowTitle">API에서 허브 반영까지, 어디에서 멈췄는지 한눈에 봐요.</h2></div><em>읽기 우선 · 채널 격리</em></header><ol>{rows.map((stage,index)=><li key={stage.id}><button type="button" onClick={()=>onStage(FLOW_WORKSPACE[stage.id]||'connections')} data-status={stage.status}><b>{String(index+1).padStart(2,'0')}</b><span><small>{stage.label}</small><strong>{stage.value}</strong><em>{stage.description}</em></span><i>→</i></button></li>)}</ol></section>;
}

function ProviderDetail({detail,busy,error}){
  if(busy)return <section className="sysDetail sysDetailLoading" aria-live="polite"><i/><strong>상태 상세 한 건을 불러오는 중…</strong><span>다른 연결 정보는 함께 요청하지 않아요.</span></section>;
  if(error)return <section className="sysDetail sysDetailError" role="alert"><HarinIcon name="warning" size={26}/><strong>{error}</strong><span>요약 상태는 그대로 유지합니다.</span></section>;
  if(!detail)return <section className="sysDetail sysDetailEmpty"><div><HarinIcon name="link" size={28}/></div><strong>핵심 연결을 선택해 상세 상태를 확인하세요.</strong><span>설정·읽기·최신성·쓰기·작업 상태를 독립해서 한 건만 불러옵니다.</span></section>;
  return <section className="sysDetail" aria-label={`${detail.label} 상세 상태`}><header><div><ServiceMark service={detail}/><span><small>SELECTED CORE SERVICE</small><h3>{detail.label}</h3><p>{detail.meta}</p></span></div><StatusPill value={detail.status} label={detail.statusLabel}/></header><div className="sysAxes">{Object.entries(detail.axes||{}).map(([key,value])=><article key={key}><span>{AXIS_LABEL[key]||key}</span><strong>{value}</strong></article>)}</div><dl className="sysFacts">{(detail.facts||[]).map(item=><div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><section className="sysDetailDatasets"><span>받는 자료</span><div>{(detail.datasets||[]).map(item=><b key={item}>{item}</b>)}</div></section><footer><span>NEXT SAFE ACTION</span><strong>{detail.action}</strong><p>누락값과 실패를 0이나 정상으로 바꾸지 않습니다.</p></footer></section>;
}

function ConnectionsPanel({model,selectedId,onSelect,detail,busy,error}){
  return <section className="sysConnections" data-system-panel="connections"><div className="sysServiceDeck"><header><span>CORE SERVICE DECK</span><h2>실제로 쓰는 핵심 연결 6개</h2><p>추천·선택형 API는 핵심 운영선에서 제외했어요.</p></header><div>{(model.services||[]).map(service=><button type="button" data-selected={selectedId===service.id} aria-pressed={selectedId===service.id} onClick={()=>onSelect(service.id)} key={service.id}><ServiceMark service={service}/><span><strong>{service.label||SERVICE_LABELS[service.id]}</strong><small>{service.meta||SERVICE_META[service.id]}</small><em>{service.summary}</em></span><aside><StatusPill value={service.status} label={service.statusLabel}/><small>최근 성공 {service.lastSuccessLabel}</small></aside><i>→</i></button>)}</div></div><ProviderDetail detail={detail} busy={busy} error={error}/></section>;
}

function DatasetsPanel({rows=[]}){
  return <section className="sysDatasetPanel" data-system-panel="datasets"><header><div><span>INCOMING DATA MAP</span><h2>받는 자료가 어느 화면에 쓰이는지 확인해요.</h2><p>채널과 수집 방식을 섞지 않고 원본 범위를 그대로 표시합니다.</p></div><em>{rows.length}개 자료군</em></header><div className="sysDatasetTable"><div className="sysDatasetHead"><span>자료군</span><span>제공처</span><span>받는 내용</span><span>반영 원칙</span></div>{rows.map(row=><article key={row.id}><strong>{row.label}</strong><div>{row.sources.map(source=><span key={source}>{source}</span>)}</div><p>{row.contents.join(' · ')}</p><em>최신성 확인 후 반영</em></article>)}</div><footer><HarinIcon name="shield" size={22}/><span><strong>API · FILE/MANUAL 경로를 구분합니다.</strong><small>파일 또는 수기 자료는 자동 수집 성공으로 표시하지 않아요.</small></span></footer></section>;
}

function JobsPanel({jobs=[]}){
  const icon={ 'vercel-cron':'clock','fixed-ip':'server',systemd:'sync',watchdog:'shield' };
  return <section className="sysJobs" data-system-panel="jobs"><header><div><span>EXECUTION ROUTES</span><h2>누가, 어디서, 언제 작업하는지 봐요.</h2><p>채널별 실행 위치와 감시 경로를 분리해 긴 로딩과 중복 작업을 막습니다.</p></div><StatusPill value={jobs.some(item=>item.status==='RUNNING')?'RUNNING':'READY'} label="작업 경로 확인"/></header><div>{jobs.map((job,index)=><article key={job.id}><b>{String(index+1).padStart(2,'0')}</b><span className="sysJobIcon"><HarinIcon name={icon[job.id]||'execution'} size={24}/></span><div><small>EXECUTOR</small><strong>{job.label||JOB_LABELS[job.id]}</strong><p>{job.route}</p></div><aside><StatusPill value={job.status}/><small>{job.schedule}</small></aside></article>)}</div><footer><i/><span><strong>한 작업은 한 실행 경로만 사용해요.</strong><small>같은 idempotency key가 진행 중이면 중복 호출하지 않습니다.</small></span></footer></section>;
}

function RecoveryPanel({items=[]}){
  return <section className="sysRecovery" data-system-panel="recovery"><header><div><span>RECOVERY BOARD</span><h2>오류가 나도 이전 성공 자료와 실패 작업을 섞지 않아요.</h2><p>복구 가능 상태, 재시도 대기, 반복 실패 격리를 별도로 봅니다.</p></div><HarinIcon name="shield" size={28}/></header><div className="sysRecoveryGrid">{items.map(item=><article data-kind={item.id} key={item.id}><span><HarinIcon name={item.id==='dead-letter'?'warning':item.id==='retry'?'clock':item.id==='read-only'?'checklist':'database'} size={24}/></span><small>{item.label}</small><strong>{item.value}<em>{item.unit}</em></strong><p>{item.description}</p></article>)}</div><section className="sysRecoveryRules"><article><b>01</b><span><strong>마지막 성공 표본 유지</strong><small>실패 시점과 이전 성공 시점을 함께 표시</small></span></article><article><b>02</b><span><strong>채널별 재시도</strong><small>정상 채널은 다시 호출하지 않음</small></span></article><article><b>03</b><span><strong>DEAD_LETTER 격리</strong><small>반복 실패를 자동 정상 처리하지 않음</small></span></article><article><b>04</b><span><strong>읽기 전용 점검</strong><small>쓰기 잠금을 유지한 채 연결만 확인</small></span></article></section></section>;
}

function SystemDesk({model,selected}){
  const next=model.summary?.deadLetters>0?'DEAD_LETTER 작업부터 확인하세요.':model.summary?.attention>0?'설정 또는 읽기 확인이 필요한 연결을 확인하세요.':'현재 핵심 연결 흐름은 안정적이에요.';
  return <div className="sysDesk"><header><span>SYSTEM OPERATIONS DESK</span><h2>핵심 연결 상태</h2><p>실제 운영에 필요한 6개만 표시합니다.</p></header><div className="sysDeskScore"><strong>{model.summary?.ready||0}<small>/ {model.services?.length||6}</small></strong><span><b>정상 연결</b><em>{model.summary?.running||0}개 작업 중 · {model.summary?.attention||0}개 확인</em></span></div><section><span>NEXT SAFE ACTION</span><strong>{next}</strong><p>선택한 연결 · {selected?.label||'없음'}</p></section><div className="sysDeskRules"><article><i/><span><small>상세 로딩</small><strong>선택한 1건만 요청</strong></span></article><article><i/><span><small>누락값</small><strong>확인 필요 · 판단 보류</strong></span></article><article><i/><span><small>외부 쓰기</small><strong>이 화면에서는 실행 안 함</strong></span></article></div><div className="sysDeskBrands"><Phase28ChannelLogo brand="NAVER"/><Phase28ChannelLogo brand="CAFE24"/><Phase28ChannelLogo brand="COUPANG"/><span><HarinIcon name="database" size={20}/></span></div></div>;
}

export default function Phase28SystemPage({model={}}){
  const router=useRouter();
  const [workspace,setWorkspace]=useState(model.initialWorkspace||'connections');
  const [selectedId,setSelectedId]=useState('');
  const [detailCache,setDetailCache]=useState({});
  const [busyId,setBusyId]=useState('');
  const [error,setError]=useState('');
  const selected=useMemo(()=>(model.services||[]).find(item=>item.id===selectedId)||null,[model.services,selectedId]);
  const detail=selectedId?detailCache[selectedId]||null:null;

  useEffect(()=>setWorkspace(model.initialWorkspace||'connections'),[model.initialWorkspace]);

  function openWorkspace(id){
    const next=WORKSPACE_HREF[id]?id:'connections';
    setWorkspace(next);
    pushPhase28Route(router,WORKSPACE_HREF[next]);
  }

  async function loadService(serviceId){
    setSelectedId(serviceId);openWorkspace('connections');setError('');
    if(detailCache[serviceId]||busyId===serviceId)return;
    setBusyId(serviceId);
    try{
      const response=await fetch(`/api/system/providers/${encodeURIComponent(serviceId)}`);
      const payload=await response.json();
      if(!response.ok||!payload.ok)throw new Error(payload.error||'핵심 연결 상세를 불러오지 못했습니다.');
      setDetailCache(current=>({...current,[serviceId]:payload.detail}));
    }catch(cause){setError(cause.message||'핵심 연결 상세를 불러오지 못했습니다.');}
    finally{setBusyId('');}
  }

  return <section className="sysPage" data-phase28-root="true" data-phase28-page="system">
    <Phase28PageHeading context={`운영 기반 · 핵심 연결 ${(model.services||[]).length||6}개`} title="허브가 움직이는 " accent="연결 흐름" suffix="을 확인해요." summary="필요한 API, 받는 자료, 실행 위치와 복구 상태를 한 화면에서 보고 상세는 필요할 때만 불러옵니다."/>
    {model.error?<div className="sysPageError" role="alert"><HarinIcon name="warning" size={22}/><span><strong>시스템 요약을 모두 불러오지 못했습니다.</strong><small>{model.error} · 누락값은 확인 필요로 유지합니다.</small></span></div>:null}
    <FlowRunway flow={model.flow} onStage={openWorkspace}/>
    <nav className="sysWorkspaceTabs" role="tablist" aria-label="시스템 작업공간">{(model.workspaces?.length?model.workspaces:WORKSPACES).map(item=><button type="button" role="tab" aria-selected={workspace===item.id} data-selected={workspace===item.id} onClick={()=>openWorkspace(item.id)} key={item.id}><span>{item.label}</span><small>{item.description}</small></button>)}</nav>
    <Phase28RightRailLayout label="시스템 운영 작업석" rail={<SystemDesk model={model} selected={selected}/>}>
      {workspace==='connections'?<ConnectionsPanel model={model} selectedId={selectedId} onSelect={loadService} detail={detail} busy={busyId===selectedId} error={error}/>:null}
      {workspace==='datasets'?<DatasetsPanel rows={model.datasets||[]}/>:null}
      {workspace==='jobs'?<JobsPanel jobs={model.jobs||[]}/>:null}
      {workspace==='recovery'?<RecoveryPanel items={model.recovery||[]}/>:null}
    </Phase28RightRailLayout>
  </section>;
}
