import Link from 'next/link';
import { notFound } from 'next/navigation';
import supabaseModule from '../../../lib/cafe24/supabase.js';
import projectsModule from '../../../lib/market-intelligence/projects.js';
import { HarinBadge, HarinButton, HarinCard, HarinPageFrame, HarinPageHeader, HarinPictogram, HarinProgressiveDetails } from '../../_design-system/harin-ui.js';
import MarketDataRoom from './data/data-room-client.js';
import MarketProductBaseline from './data/product-baseline-client.js';
import MarketProfileWorkbench from './market/market-profile-client.js';
import CompetitionWorkbench from './competition/competition-client.js';
import ConversionWorkbench from './conversion/conversion-client.js';
import GrowthLoopWorkbench from './conversion/growth-loop-client.js';
import ExecutionBridgeWorkbench from './conversion/execution-bridge-client.js';

const STAGES={
  data:{number:'01',label:'자료실',eyebrow:'DATA ROOM',icon:'database',tone:'blue',description:'파일과 출처를 모으고 OCR 결과를 사장님이 확인하는 공간입니다.',empty:'아직 검수된 근거가 없습니다.',next:'자료 업로드·OCR·Evidence 연결'},
  market:{number:'02',label:'시장 분석',eyebrow:'MARKET SCOPE',icon:'analysis',tone:'lavender',description:'사장님이 승인한 시장범위와 실제 수요 신호를 확인합니다.',empty:'아직 승인된 시장범위가 없습니다.',next:'시장범위·수요·페르소나 연결'},
  competition:{number:'03',label:'경쟁 분석',eyebrow:'COMPETITION',icon:'search',tone:'pink',description:'경쟁 상품 리뷰의 불편과 우리 상품이 해결하는 근거를 함께 봅니다.',empty:'아직 검수된 경쟁 근거가 없습니다.',next:'경쟁상품·리뷰·차별화 연결'},
  conversion:{number:'04',label:'구매 전환',eyebrow:'CONVERSION',icon:'target',tone:'mint',description:'구매 장벽, 상세페이지, 판매구성, 재구매와 실험을 연결합니다.',empty:'아직 저장된 전환안이 없습니다.',next:'장벽·상세페이지·구성·재구매 연결'}
};

export async function renderMarketWorkspace({projectId,workspace}){
  const stage=STAGES[workspace];
  if(!stage)notFound();
  let data;
  try{data=await projectsModule.loadProject({db:supabaseModule.getSupabase(),projectId});}
  catch(error){if(error.code==='PROJECT_NOT_FOUND'||error.code==='INVALID_UUID')notFound();throw error;}
  const {project,product,versions}=data;
  const productName=product?.name||project.product_snapshot?.name||'선택 상품';
  const tabs=Object.entries(STAGES);
  return <HarinPageFrame kind="analysis" className={`marketWorkspace marketWorkspace-${workspace}`}>
    <HarinPageHeader eyebrow={stage.eyebrow} title={project.project_name} description={stage.description} icon={stage.icon} tone={stage.tone} note={`${product?.name||project.product_snapshot?.name||'선택 상품'} 전용 프로젝트 · 다른 상품 자료와 분리 저장`} metrics={[
      {label:'선택 상품',value:productName,description:product?.is_active===false?'현재 판매중단':'판매 중 기준상품'},
      {label:'현재 버전',value:`v${project.active_version}`,description:`저장 버전 ${versions.length}개`},
      {label:'프로젝트 상태',value:project.status==='ACTIVE'?'진행 중':'초안',description:'사장님 확인 전'}
    ]} actions={<HarinButton as="a" href="/market-intelligence" variant="secondary" icon="product">다른 상품 선택</HarinButton>}/>
    <nav className="marketWorkspaceTabs" aria-label="시장·전환 분석 단계">{tabs.map(([id,item])=><Link href={projectsModule.projectHref(project.id,id)} className={workspace===id?'active':''} aria-current={workspace===id?'page':undefined} data-tone={item.tone} key={id}><i>{item.number}</i><HarinPictogram icon={item.icon} tone={item.tone} size={18}/><span><b>{item.label}</b><small>{item.next}</small></span></Link>)}</nav>
    {workspace==='data'?<><MarketProductBaseline projectId={project.id} productName={productName}/><MarketDataRoom projectId={project.id} productName={productName}/></>:workspace==='market'?<MarketProfileWorkbench projectId={project.id} productName={productName}/>:workspace==='competition'?<CompetitionWorkbench projectId={project.id} productName={productName}/>:workspace==='conversion'?<><ConversionWorkbench projectId={project.id} productName={productName}/><GrowthLoopWorkbench projectId={project.id} productName={productName}/><ExecutionBridgeWorkbench projectId={project.id} productName={productName}/></>:<HarinCard className="marketStageEmpty">
      <HarinPictogram icon={stage.icon} tone={stage.tone} size={26}/><div><HarinBadge tone="neutral">{stage.number} · {stage.label}</HarinBadge><h2>{stage.empty}</h2><p>선택한 상품의 프로젝트와 버전 저장 공간은 준비되었습니다. 다음 세부 기능도 이 주소 안에 이어서 연결됩니다.</p></div>
    </HarinCard>}
    <section className="marketProjectIdentity"><article><small>상품 격리 키</small><b>{project.master_product_id}</b><p>상품을 바꾸면 별도 프로젝트를 엽니다.</p></article><article><small>재사용 템플릿</small><b>{project.template_id}</b><p>화면 구조만 같고 근거는 복사하지 않습니다.</p></article><article><small>최근 저장</small><b>{project.updated_at?new Date(project.updated_at).toLocaleString('ko-KR'):'기록 없음'}</b><p>모든 변경은 버전으로 남깁니다.</p></article></section>
    <HarinProgressiveDetails eyebrow="이 페이지의 AI" title={`${stage.label} AI 분석`} description="현재 상품과 이 페이지의 검수된 자료만 따로 사용합니다." count="사용 시작 전 · 비용 0원"><div className="marketAiPreview"><HarinPictogram icon="ai" tone="lavender"/><span><b>외부 AI 호출은 아직 잠겨 있어요.</b><p>근거가 준비되지 않으면 숫자를 만들지 않고 판단 보류로 유지합니다.</p></span></div></HarinProgressiveDetails>
  </HarinPageFrame>;
}

export {STAGES};
