'use client';

import Link from 'next/link';
import {useMemo,useState} from 'react';
import HarinIcon from '../../_design-system/harin-icon.js';
import {Phase28ChannelLogo} from '../primitives/channel-logo.js';
import {Phase28PageHeading} from '../primitives/page-heading.js';
import {Phase28RightRailLayout} from '../primitives/right-rail-layout.js';
import './development-page.css';

const FALLBACK_STAGES=[
  {id:'data',label:'자료 준비',shortLabel:'근거',threshold:22,description:'파일·출처·OCR 검수'},
  {id:'market',label:'시장 분석',shortLabel:'시장',threshold:42,description:'시장범위·수요 신호'},
  {id:'conversion',label:'경쟁·전환 설계',shortLabel:'전환',threshold:64,description:'차별화·구매 장벽'},
  {id:'experiment',label:'A/B 실험',shortLabel:'실험',threshold:82,description:'가설·표본·성과 비교'},
  {id:'learning',label:'결과 학습',shortLabel:'학습',threshold:100,description:'7일·14일 검증'}
];
const ICONS={data:'database',market:'analysis',conversion:'target',experiment:'experiments',learning:'checklist'};
const CHAPTERS={
  data:{number:'01',eyebrow:'EVIDENCE ROOM',title:'상품 근거와 자료 준비',body:'상품 기준정보, 공식 출처, 업로드 파일과 OCR 판독 결과를 사장님이 직접 검수합니다.',fact:'OCR 값은 승인 전까지 근거로 확정하지 않아요.'},
  market:{number:'02',eyebrow:'MARKET SCOPE',title:'시장 분석과 수요 신호',body:'같은 문제를 해결하는 상품의 범위와 네이버 수요 근거를 분리해서 확인합니다.',fact:'외부 자료가 없으면 시장 규모를 0으로 만들지 않아요.'},
  conversion:{number:'03',eyebrow:'COMPETITION',title:'경쟁 근거와 구매 장벽',body:'경쟁상품의 불편, 우리 상품의 해결 근거, 상세페이지 전환 장벽을 한 흐름으로 연결합니다.',fact:'차별화는 양쪽 근거가 모두 확인돼야 확정해요.'},
  experiment:{number:'04',eyebrow:'EXPERIMENT',title:'가설과 A/B 실험',body:'선택 상품과 프로젝트에만 연결된 실험을 만들고 표본·승자·비용을 따로 기록합니다.',fact:'광고나 상품을 자동 변경하지 않아요.'},
  learning:{number:'05',eyebrow:'LEARNING LOOP',title:'승인·실행 검증과 결과 학습',body:'실행 전 승인 기록과 실행 후 7일·14일 결과를 비교해 다음 개발에 재사용합니다.',fact:'결과는 당시 버전으로 저장해 나중에도 다시 열어요.'}
};
const CHANNELS=['NAVER','CAFE24','COUPANG'];
const count=value=>`${Math.max(0,Number(value)||0).toLocaleString('ko-KR')}개`;
const time=value=>{if(!value)return '기준시각 확인 필요';const date=new Date(value);return Number.isNaN(date.getTime())?'기준시각 확인 필요':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);};

function normalizeDetail(payload,project){
  const row=payload?.project||project||{};
  return {
    project:{id:String(row.id||project?.id||''),name:row.project_name||row.name||project?.name||'상품개발 프로젝트',masterProductId:String(row.master_product_id||project?.masterProductId||''),activeVersion:Number(row.active_version||project?.activeVersion||1),status:String(row.status||project?.status||'DRAFT'),updatedAt:row.updated_at||project?.updatedAt||null},
    product:payload?.product||null,
    versions:Array.isArray(payload?.versions)?payload.versions:[]
  };
}

function workspaceHref(stageId,projectId,productId){
  if(stageId==='data')return `/market-intelligence/${projectId}/data`;
  if(stageId==='market')return `/market-intelligence/${projectId}/market`;
  if(stageId==='conversion')return `/market-intelligence/${projectId}/competition`;
  if(stageId==='experiment')return `/ab-tests?master_product_id=${encodeURIComponent(productId)}&market_project_id=${encodeURIComponent(projectId)}`;
  return `/execution-validation?master_product_id=${encodeURIComponent(productId)}&market_project_id=${encodeURIComponent(projectId)}`;
}

function DevelopmentRunner({products,selectedId,onSelect,onOpen,busy}){
  const selected=products.find(item=>item.id===selectedId)||null;
  return <section className="pdRunner" aria-labelledby="pdRunnerTitle" data-state={busy?'busy':selected?'ready':'waiting'}>
    <header><div><span>PRODUCT DEVELOPMENT RUNNER</span><h2 id="pdRunnerTitle">상품을 고른 뒤, 저장된 프로젝트를 확인하고 개발공간을 열어요.</h2><p>선택만으로 새 프로젝트를 만들지 않습니다. 상품별 근거와 실험은 서로 섞이지 않아요.</p></div><em><i/>{busy?'불러오는 중':selected?'열기 준비':'상품 선택 대기'}</em></header>
    <div className="pdRunFlow">
      <article><b>01</b><div><span>상품 선택</span><strong>판매상품 하나</strong><small>판매 중 기준상품만 표시</small><label><i>상품을 선택하세요</i><select value={selectedId} onChange={event=>onSelect(event.target.value)}><option value="">상품을 선택하세요</option>{products.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div></article>
      <article><b>02</b><div><span>프로젝트 확인</span><strong>{selected?.project?'이어갈 기록 있음':'첫 프로젝트 준비'}</strong><small>{selected?.project?`${selected.project.name} · v${selected.project.activeVersion}`:'명시적으로 열 때 생성'}</small><div className="pdProjectState" data-ready={Boolean(selected?.project)}><i/><em>{selected?.development?.label||'선택 대기'}</em><b>{selected?.development?.progress||0}%</b></div></div></article>
      <article><b>03</b><div><span>개발공간 열기</span><strong>저장 근거 불러오기</strong><small>상세는 이때 한 번만 요청</small><button type="button" disabled={!selected||busy} onClick={onOpen}>{busy?'개발공간 여는 중':selected?.project?'저장 프로젝트 열기':'새 프로젝트 만들기'}<i>→</i></button></div></article>
    </div>
    {selected?<div className="pdSelected"><span>{selected.name.slice(0,1)}</span><div><div>{CHANNELS.map(brand=><Phase28ChannelLogo brand={brand} size="compact" key={brand}/>)}</div><strong>{selected.name}</strong><small>판매가 {selected.priceLabel} · {selected.project?`저장 버전 ${selected.project.activeVersion}개`:'프로젝트 없음'}</small></div><em>상품 격리 키<br/><b>{selected.id}</b></em></div>:null}
    <footer><i><b/></i><span>{selected?`${selected.name}을 선택했습니다. 아직 데이터 요청이나 프로젝트 생성은 하지 않았어요.`:'개발할 판매상품을 선택해 주세요.'}</span></footer>
  </section>;
}

function ProjectLedger({projects,activeId,onOpen,busyId}){
  return <section className="pdLedger" aria-labelledby="pdLedgerTitle"><header><div><span>PROJECT LEDGER</span><h2 id="pdLedgerTitle">저장된 상품개발</h2><p>상품·현재 버전·마지막 작업 단계를 확인한 뒤 필요한 기록만 엽니다.</p></div><strong>{count(projects.length)}</strong></header>{projects.length?<div>{projects.map(project=><button type="button" data-selected={project.id===activeId} onClick={()=>onOpen(project)} disabled={busyId===project.id} key={project.id}><span>{project.name.slice(0,1)}</span><div><strong>{project.name}</strong><small>v{project.activeVersion} · {project.development.label} · {time(project.lastOpenedAt)}</small></div><em data-status={project.status}>{project.status==='ARCHIVED'?'보관':'진행 중'}</em><i>{busyId===project.id?'…':'→'}</i></button>)}</div>:<p className="pdLedgerEmpty">저장된 상품개발이 없습니다. 판매상품을 선택한 뒤 새 프로젝트 만들기를 눌러주세요.</p>}</section>;
}

function DevelopmentRunway({stages,progress,activeStage,onStage}){
  return <section className="pdRunway" aria-labelledby="pdRunwayTitle"><header><div><span>PRODUCT EVIDENCE RUNWAY</span><h2 id="pdRunwayTitle">근거에서 실험과 학습까지 한 방향으로 이어져요.</h2></div><strong>{progress}%</strong></header><ol>{stages.map((stage,index)=>{const complete=progress>=stage.threshold,current=stage.id===activeStage;return <li key={stage.id}><button type="button" aria-pressed={current} data-complete={complete} onClick={()=>onStage(stage.id)}><i>{complete?'✓':String(index+1).padStart(2,'0')}</i><HarinIcon name={ICONS[stage.id]} size={22}/><span><strong>{stage.label}</strong><small>{stage.description}</small></span><em>{current?'보고 있음':complete?'기록 있음':'확인 필요'}</em></button></li>;})}</ol></section>;
}

function ChapterDesk({stageId,project,productId}){
  const chapter=CHAPTERS[stageId]||CHAPTERS.data;
  const href=workspaceHref(stageId,project.id,productId);
  const secondary=stageId==='conversion'?`/market-intelligence/${project.id}/conversion`:null;
  return <section className="pdChapter"><header><b>{chapter.number}</b><div><span>{chapter.eyebrow}</span><h3>{chapter.title}</h3><p>{chapter.body}</p></div></header><div><article><HarinIcon name={ICONS[stageId]} size={25}/><span><small>현재 판단</small><strong>저장 근거를 열어 확인하세요.</strong><em>미연결 값은 판단 보류</em></span></article><article><HarinIcon name="checklist" size={25}/><span><small>안전 기준</small><strong>{chapter.fact}</strong><em>자동 실행 없음</em></span></article></div><footer><Link href={href}>이 단계 작업공간 열기 <i>→</i></Link>{secondary?<Link href={secondary} className="pdSecondaryLink">구매 전환 설계 이어보기</Link>:null}</footer></section>;
}

function ProjectReport({detail,product,stages,activeStage,onStage}){
  const project=detail.project;
  const progress=product?.development?.progress||0;
  return <div className="pdReport"><header><div><span>상품개발 프로젝트</span><h2>{project.name}</h2><p>{product?.name||detail.product?.name||'선택 상품'} 전용 프로젝트 · 다른 상품의 근거를 복사하지 않습니다.</p></div><dl><div><dt>현재 버전</dt><dd>v{project.activeVersion}</dd></div><div><dt>저장 기록</dt><dd>{detail.versions.length}개</dd></div><div><dt>최근 상태</dt><dd>{product?.development?.label||'확인 필요'}</dd></div></dl></header><DevelopmentRunway stages={stages} progress={progress} activeStage={activeStage} onStage={onStage}/><ChapterDesk stageId={activeStage} project={project} productId={product?.id||project.masterProductId}/><section className="pdVersionHistory"><header><span>VERSION HISTORY</span><h3>분석 당시 기록을 읽기 전용으로 남겨요.</h3></header>{detail.versions.length?<ol>{detail.versions.map(version=><li key={version.id||version.version_number}><b>v{version.version_number}</b><span><strong>{version.reason||'저장 기록'}</strong><small>{time(version.created_at)}</small></span><em>읽기 전용</em></li>)}</ol>:<p>아직 불러온 버전 기록이 없습니다.</p>}<footer><Link href={`/market-intelligence/${project.id}/b2b`}>B2B·조달 준비도 확인</Link><span>세부 작업대는 필요할 때만 불러옵니다.</span></footer></section></div>;
}

function EmptyReport(){return <section className="pdEmpty"><div><i/><b>?</b></div><article><span>DEVELOPMENT SPACE WAITING</span><h2>아직 개발공간을 열지 않았어요.</h2><p>위에서 상품을 선택하고 프로젝트를 확인한 다음 개발공간 열기를 눌러주세요. 선택만으로는 데이터 요청이나 프로젝트 생성이 일어나지 않습니다.</p></article><ol><li><b>1</b> 판매상품 선택</li><li><b>2</b> 기존 프로젝트 확인</li><li><b>3</b> 상세 근거 지연 로딩</li></ol></section>;}

function DecisionDesk({product,detail,policy}){
  const development=product?.development||{};
  const project=detail?.project||product?.project||null;
  return <div className="pdDecisionDesk"><header><span>PRODUCT DECISION DESK</span><h2>{product?.name||'상품을 선택하세요'}</h2><p>{project?`${project.name||project.project_name} · v${project.activeVersion||project.active_version||1}`:'상품별 프로젝트를 열기 전입니다.'}</p></header><div className="pdDeskState"><i data-ready={Boolean(project)}/><span><small>현재 개발 상태</small><strong>{development.label||'선택 대기'}</strong><em>{development.progress||0}% 진행</em></span></div><section><span>NEXT SAFE ACTION</span><strong>{product?development.nextAction||'근거 확인':'판매상품을 먼저 선택하세요.'}</strong><p>확인 없이 상품·광고·실험을 자동 변경하지 않습니다.</p></section><div className="pdDeskFlow"><article><i/><span><small>상품 격리</small><strong>{policy?.projectIsolation||'master_product_id'}</strong></span></article><article><i/><span><small>누락값 처리</small><strong>{policy?.missingAsZero===false?'확인 필요 · 판단 보류':'정책 확인 필요'}</strong></span></article><article><i/><span><small>상세 로딩</small><strong>개발공간을 열 때만 요청</strong></span></article></div><div className="pdDeskChannels">{CHANNELS.map(brand=><Phase28ChannelLogo brand={brand} key={brand}/>)}</div></div>;
}
export default function Phase28DevelopmentPage({model={}}){
  const [products,setProducts]=useState(model.products||[]);
  const [projects,setProjects]=useState(model.projects||[]);
  const [selectedId,setSelectedId]=useState(products.find(item=>item.project)?.id||products[0]?.id||'');
  const [activeDetail,setActiveDetail]=useState(null);
  const [activeStage,setActiveStage]=useState('data');
  const [detailCache,setDetailCache]=useState({});
  const [busyId,setBusyId]=useState('');
  const [message,setMessage]=useState(model.error||'');
  const selected=useMemo(()=>products.find(item=>item.id===selectedId)||null,[products,selectedId]);
  const stages=model.stages?.length?model.stages:FALLBACK_STAGES;

  function chooseProduct(id){setSelectedId(id);setActiveDetail(null);setActiveStage('data');setMessage('');}

  async function fetchProjectDetail(project){
    if(!project?.id)return;
    if(detailCache[project.id]){setActiveDetail(detailCache[project.id]);setActiveStage('data');return;}
    if(busyId===project.id)return;
    setBusyId(project.id);setMessage('');
    try{
      const response=await fetch(`/api/market-intelligence/projects/${encodeURIComponent(project.id)}`);
      const payload=await response.json();
      if(!response.ok||!payload.ok)throw new Error(payload.error||'상품개발 프로젝트를 불러오지 못했습니다.');
      const detail=normalizeDetail(payload,project);
      setDetailCache(current=>({...current,[project.id]:detail}));
      setActiveDetail(detail);setActiveStage('data');
    }catch(error){setMessage(error.message||'상품개발 프로젝트를 불러오지 못했습니다.');}
    finally{setBusyId('');}
  }

  async function openSelected(){
    if(!selected)return;
    if(selected.project){await fetchProjectDetail(selected.project);return;}
    if(!window.confirm(`${selected.name} 전용 상품개발 프로젝트를 새로 만들까요?\n상품별 근거와 실험은 별도 공간에 저장됩니다.`))return;
    setBusyId('create');setMessage('');
    try{
      const response=await fetch('/api/market-intelligence/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({master_product_id:selected.id})});
      const payload=await response.json();
      if(!response.ok||!payload.ok)throw new Error(payload.error||'상품개발 프로젝트를 만들지 못했습니다.');
      const project={id:String(payload.project.id),masterProductId:selected.id,name:payload.project.project_name||`${selected.name} 상품개발`,status:payload.project.status||'DRAFT',activeVersion:Number(payload.project.active_version||1),href:payload.href,updatedAt:payload.project.updated_at||null,lastOpenedAt:payload.project.last_opened_at||null,development:{status:'PREPARING',label:'자료 준비',progress:22,plans:0,experiments:0,reports:0,nextAction:'자료 채우기'}};
      setProducts(current=>current.map(item=>item.id===selected.id?{...item,project,development:project.development}:item));
      setProjects(current=>[project,...current]);
      setMessage('상품 전용 프로젝트를 만들었습니다. 상세 근거를 불러옵니다.');
      await fetchProjectDetail(project);
    }catch(error){setMessage(error.message||'상품개발 프로젝트를 만들지 못했습니다.');}
    finally{setBusyId('');}
  }

  function openLedger(project){
    setSelectedId(project.masterProductId);
    fetchProjectDetail(project);
  }

  const summary=model.summary||{};
  return <main className="p28Development" data-phase28-root="true" data-phase28-page="development">
    <div className="pdIntro"><Phase28PageHeading context={`판매상품 ${summary.productCount??products.length}개 · 진행 프로젝트 ${summary.projectCount??projects.length}개 · 상품별 근거 분리`} title="상품을 고르면 " accent="개발 근거" suffix="가 한 줄로 이어져요." summary="시장 근거, 경쟁과 구매 장벽, 실험과 실행 결과를 선택 상품의 프로젝트 안에서 계속 쌓아갑니다."/><div className="pdIntroStatus"><HarinIcon name="development" size={24}/><span><small>상품개발 기준</small><strong>{time(model.generatedAt)}</strong><em>상세 지연 로딩 · 서버 저장</em></span></div></div>
    <DevelopmentRunner products={products} selectedId={selectedId} onSelect={chooseProduct} onOpen={openSelected} busy={Boolean(busyId)}/>
    {message?<div className="pdMessage" role="status">{message}</div>:null}
    <ProjectLedger projects={projects} activeId={activeDetail?.project?.id} onOpen={openLedger} busyId={busyId}/>
    <Phase28RightRailLayout label="상품개발 판단 패널" rail={<DecisionDesk product={selected} detail={activeDetail} policy={model.policy}/>}>{activeDetail?<ProjectReport detail={activeDetail} product={selected} stages={stages} activeStage={activeStage} onStage={setActiveStage}/>:<EmptyReport/>}</Phase28RightRailLayout>
  </main>;
}
