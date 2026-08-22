'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import costWorkbenchModule from '../../lib/products/cost-workbench.js';
import { useStoredState } from '../use-hub-preference.js';
import { HarinProgressiveDetails } from '../_design-system/harin-ui.js';
import { HarinBulkCheckbox, HarinBulkSelectionBar, useHarinBulkSelection } from '../_design-system/harin-bulk-selection.js';
import HarinIcon from '../_design-system/harin-icon.js';

const { PAGE_SIZE:COST_PAGE_SIZE, COST_FIELDS, costStatus, filterCostProducts, paginateCostProducts, summarizeCostProgress } = costWorkbenchModule;

function ProductWorkbenchFallback(){
  return <section className="lazyWorkbenchFallback" role="status" aria-live="polite" aria-busy="true"><i aria-hidden="true"/><span><b>상품 작업대를 준비하고 있어요</b><small>현재 화면은 유지하고 필요한 상품 기능만 불러옵니다.</small></span></section>;
}

const ProductGrowthCenter=dynamic(()=>import('../product-growth-center.js'),{loading:ProductWorkbenchFallback});
const ProductAdTargetsCenter=dynamic(()=>import('../product-ad-targets-center.js'),{loading:ProductWorkbenchFallback});
const UnifiedProductOperationsCenter=dynamic(()=>import('../unified-product-operations-center.js'),{loading:ProductWorkbenchFallback});

const won=value=>`${Math.round(Number(value||0)).toLocaleString('ko-KR')}원`;
const count=value=>Number(value||0).toLocaleString('ko-KR');
const num=value=>Number(value||0);

async function executeConfirmedFinancialPreview(previewResult){
  const requestId=previewResult?.request?.id;
  if(!requestId)throw new Error('변경 기록 ID를 받지 못했습니다. 다시 시도해주세요.');
  const response=await fetch(`/api/financial-changes/${requestId}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'CONFIRM_EXECUTE',confirm:true,note:'사장님 확인 팝업 후 즉시 실행'})});
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error(result.error||'변경을 적용하지 못했습니다.');
  if(result.blocked||result.applied===false)throw new Error(result.request?.error_message||'자료가 바뀌어 실행을 멈췄습니다. 다시 확인해주세요.');
  if(!result.verified)throw new Error(result.request?.error_message||'변경 후 실제값 재확인이 필요합니다. 변경 기록을 확인해주세요.');
  return result;
}

function Kpi({tone,icon,label,value,sub}){
  return <article className={`kpi ${tone}`}><div className="kpiIcon">{icon}</div><div><p>{label}</p><strong>{value}</strong><span>{sub}</span></div></article>;
}
function Empty({children}){return <div className="empty">{children}</div>;}
function PanelTitle({tag,title,right}){return <div className="panelHead"><div><span className="sectionTag">{tag}</span><h2>{title}</h2></div>{right&&<span className="period">{right}</span>}</div>;}

function PlatformProductView({platform,workspace,data}) {
  const common={products:data.products||[],topProducts:data.topProducts||[],masterProducts:data.masterProducts||[],channelProducts:data.channelProducts||[],productCosts:data.productCosts||[],channelCostSettings:data.channelCostSettings||[],channelShippingRules:data.channelShippingRules||[],shippingRuleEvidence:data.shippingRuleEvidence||{},costCalibration:data.costCalibration||{},profitability:data.liveProfitability||{},financialTrust:data.financialTrust||{},financialReadiness:data.financialReadiness||{},productAdTargets:data.productAdTargets||{summary:{},items:[]},mapping:data.productMapping||{summary:{},candidates:[],links:[]},unifiedPerformance:data.unifiedProductPerformance||{summary:{},items:[]},productOperations:data.productOperations||{summary:{},items:[]}};
  if(workspace==='catalog'&&platform==='coupang')return <CoupangProductHub coupang={data.coupang}/>;
  if(workspace==='catalog'&&platform==='naver')return <NaverProductHub channelProducts={common.channelProducts} naver={data.naver}/>;
  return <ProductView {...common} platform={workspace==='catalog'?platform:'all'} workspace={workspace}/>;
}

function CoupangProductHub({coupang}) {
  const items=coupang.productPerformance||[], inventory=coupang.rgInventory||[];
  return <><section className="pageIntro productIntro"><div><span className="eyebrow">COUPANG PRODUCT HUB</span><h1>쿠팡 상품 관리</h1><p>상품별 주문·판매수량·매출과 로켓그로스 판매가능재고를 함께 확인합니다.</p></div></section><section className="kpiGrid"><Kpi tone="orange" icon="₩" label="30일 매출" value={won(coupang.salesOverview?.last30?.revenue)} sub={`${count(coupang.salesOverview?.last30?.orders)}건 주문`}/><Kpi tone="blue" icon="#" label="판매수량" value={`${count(coupang.salesOverview?.last30?.units)}개`} sub="최근 30일"/><Kpi tone="green" icon="S" label="판매가능재고" value={`${count(coupang.rgTotalOrderable)}개`} sub={`${inventory.length}개 SKU`}/><Kpi tone="purple" icon="!" label="품절·저재고" value={`${count(num(coupang.rgOutOfStock)+num(coupang.rgLowStock))}개`} sub="재고 조치 필요"/></section><article className="panel"><PanelTitle tag="COUPANG CATALOG" title="상품별 매출·판매·재고" right={`${items.length}개 상품`}/><div className="platformDataList">{items.slice(0,30).map((item,index)=><div className="platformDataRow productPlatformRow" key={item.vendorItemId}><b>{index+1}</b><section><strong>{item.name}</strong><small>상품 ID {item.vendorItemId} · 주문 {count(item.totals?.orders)}건 · 판매 {count(item.totals?.units)}개</small></section><span className={num(item.inventory?.quantity)<=0?'platformPill danger':'platformPill good'}>재고 {count(item.inventory?.quantity)}개</span><em>{won(item.totals?.revenue)}</em></div>)}{!items.length&&<Empty>쿠팡 주문·상품 데이터를 동기화해주세요.</Empty>}</div></article></>;
}

function NaverProductHub({channelProducts,naver}) {
  const items=channelProducts.filter(item=>item.platform==='NAVER');
  return <><section className="pageIntro productIntro"><div><span className="eyebrow">NAVER AD REFERENCE</span><h1>네이버 광고 연결</h1><p>현재 데이터는 스마트스토어 실상품이 아니라 검색광고 캠페인·광고그룹 연결입니다.</p></div></section><section className="kpiGrid"><Kpi tone="green" icon="A" label="광고그룹 연결" value={`${items.length}개`} sub="실상품 연결과 별도"/><Kpi tone="orange" icon="₩" label="전환매출" value={won(naver?.totals?.revenue)} sub="최근 7일 광고 성과"/><Kpi tone="blue" icon="%" label="ROAS" value={`${num(naver?.totals?.roas).toFixed(1)}%`} sub={`${naver?.campaigns||0}개 캠페인`}/><Kpi tone="purple" icon="K" label="등록 키워드" value={`${count(naver?.keywords)}개`} sub="검색광고 API"/></section><article className="panel"><PanelTitle tag="NAVER ADGROUP LINK" title="광고그룹·기준상품 연결" right={`${items.length}개 연결`}/><div className="platformDataList">{items.map((item,index)=><div className="platformDataRow" key={item.id}><b>{index+1}</b><section><strong>{item.external_product_name||item.external_product_id}</strong><small>광고그룹 ID {item.external_product_id} · 실상품이 아닌 광고 성과 귀속용</small></section><em>광고 참고</em></div>)}{!items.length&&<Empty>기준상품에 연결된 네이버 광고그룹이 없습니다.</Empty>}</div></article></>;
}

function FinancialReadinessCenter({ readiness={}, showAdTargets=true }) {
  const router=useRouter();
  const coverage=readiness.current_cost_coverage_rate;
  const priorities=(readiness.priority_products||[]).filter(item=>item.required_for_target);
  const eligibleIds=new Set(readiness.sellableMasterIds||[]);
  const costPriorities=priorities.filter(item=>item.master_product_id&&eligibleIds.has(item.master_product_id));
  const statusLabel={READY:'완료',ACTION_REQUIRED:'입력 필요',CHECK_REQUIRED:'확인 필요'};
  const [costRows,setCostRows]=useState(()=>Object.fromEntries(costPriorities.map(item=>[item.master_product_id,{unit_cost:'',packaging_cost:'',other_unit_cost:''}])));
  const [saving,setSaving]=useState(''),[message,setMessage]=useState('');
  const scrollTo=target=>(document.getElementById(target)||document.querySelector(target))?.scrollIntoView({behavior:'smooth',block:'start'});
  async function savePriorityCost(product){
    const row=costRows[product.master_product_id]||{};
    if(num(row.unit_cost)+num(row.packaging_cost)+num(row.other_unit_cost)<=0){setMessage(`${product.name}의 실제 비용을 1원 이상 입력해주세요.`);return;}
    setSaving(product.master_product_id);setMessage('변경 전후 영향을 계산 중…');
    if(!window.confirm(`${product.name}의 입력 원가를 지금 저장할까요?\n변경 전후 값과 실행 결과는 기록에 남습니다.`)){setSaving('');setMessage('');return;}
    try{const response=await fetch('/api/costs',{method:'PUT',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({type:'PRODUCT',master_product_id:product.master_product_id,...row})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'변경 준비 실패');await executeConfirmedFinancialPreview(result);setMessage(`${product.name} 원가 저장 완료 · 실제 저장값도 확인했습니다.`);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving('');}
  }
  return <><article className={`panel financialReadinessCenter ${String(readiness.status||'ACTION_REQUIRED').toLowerCase()}`}>
    <header className="financialReadinessHead"><div><span>이익 계산 준비</span><h2>이익 신뢰 회복센터</h2><p>실제 원가를 임의로 추정하지 않고, 매출 영향이 큰 상품부터 입력해 이익 계산을 안전하게 엽니다.</p></div><strong>{readiness.status==='READY'?'이익 계산 가능':'계산 보호 중'}</strong></header>
    <div className="financialReadinessProgress"><div><span style={{width:`${Math.max(0,Math.min(100,num(coverage)))}%`}}/></div><p><b>현재 {coverage==null?'확인 필요':`${num(coverage).toFixed(1)}%`}</b><em>목표 {num(readiness.target_cost_coverage_rate||95).toFixed(0)}%</em></p></div>
    <div className="financialReadinessKpis"><span><small>우선 입력</small><b>{count(readiness.priority_input_count)}개</b><em>95% 달성 최소 묶음</em></span><span><small>미입력 매출</small><b>{won(readiness.missing_cost_revenue)}</b><em>{count(readiness.missing_cost_products)}개 상품</em></span><span><small>추가 반영 필요</small><b>{won(readiness.required_additional_revenue)}</b><em>매출 기준</em></span><span><small>미귀속 광고비</small><b>{won(readiness.unassigned_ad_spend)}</b><em>쿠팡 상품 연결 확인</em></span></div>
    <div className="financialReadinessChecklist">{(readiness.checklist||[]).map(item=><section className={String(item.status).toLowerCase()} key={item.id}><i>{item.status==='READY'?'✓':'!'}</i><div><b>{item.title}</b><p>{item.detail}</p></div><em>{statusLabel[item.status]||item.status}</em></section>)}</div>
    {priorities.length?<><div className="financialPriorityPreview"><header><b>먼저 처리할 상품</b><span>전체 주문 매출이 큰 순서 · 이 목록까지 처리하면 95% 도달</span></header>{priorities.map(item=><button type="button" key={`${item.master_product_id||'unmapped'}:${item.rank}`} onClick={()=>item.mapping_required?router.push('/products/mappings'):scrollTo(`product-cost-${item.master_product_id}`)}><i>{item.rank}</i><span><b>{item.name}</b><small>매출 {won(item.revenue)} · 전체의 {num(item.revenue_share_rate).toFixed(1)}%</small></span><em>{item.mapping_required?'상품 연결 먼저':`입력 후 ${num(item.projected_coverage_rate).toFixed(1)}%`}</em></button>)}</div>{costPriorities.length?<section className="priorityCostInputs" id="priority-cost-inputs"><header><b>실제 원가 입력</b><span>모르는 비용은 0원으로 확정하지 말고 비워두세요.</span></header><div className="priorityCostHead"><span>상품</span><span>상품 원가</span><span>포장비</span><span>기타 단위비</span><span>미리보기</span></div>{costPriorities.map(item=>{const row=costRows[item.master_product_id]||{};return <div className="priorityCostRow" id={`product-cost-${item.master_product_id}`} key={item.master_product_id}><span><i>{item.rank}</i><b>{item.name}</b><small>매출 {won(item.revenue)}</small></span>{['unit_cost','packaging_cost','other_unit_cost'].map(field=><input key={field} type="number" min="0" step="100" placeholder="실제 금액" value={row[field]??''} onChange={event=>setCostRows(current=>({...current,[item.master_product_id]:{...row,[field]:event.target.value}}))}/>)}<button type="button" disabled={saving===item.master_product_id} onClick={()=>savePriorityCost(item)}>{saving===item.master_product_id?'계산 중':'저장 검토'}</button></div>;})}{message&&<p className="priorityCostMessage">{message}</p>}</section>:null}</>:<div className="financialReadyMessage">우선 입력할 상품이 없습니다. 원가 반영 목표를 충족했습니다.</div>}
    <footer><button type="button" onClick={()=>scrollTo('priority-cost-inputs')}>우선 원가 입력하기</button><button type="button" className="secondaryButton" onClick={()=>router.push('/products/mappings')}>상품 연결 검토</button></footer>
    <details><summary>이 화면은 어떻게 쓰나요?</summary><p><b>예시:</b> 전체 매출 100만원 중 원가가 확인된 상품 매출이 50만원이면 반영률은 50%입니다. 다음으로 매출이 큰 상품 몇 개의 실제 원가를 입력해 95만원까지 확인되면 이익 계산이 열립니다. 매입가를 모르면 0원으로 저장하지 말고 거래명세서 확인 후 입력하세요.</p></details>
  </article>{showAdTargets?<ProductAdTargetsCenter center={readiness.productAdTargets||{summary:{},items:[]}}/>:null}</>;
}

function CatalogCards({items=[]}) {
  const [visibleCount,setVisibleCount]=useState(18);
  const visible=items.slice(0,visibleCount);
  return <><div className="productGrid">{visible.map(product=><div className="productCard" key={product.id}>{product.image?<div className="productImage" role="img" aria-label={product.name} style={{backgroundImage:`url(${product.image})`}}/>:<div className="imageFallback">H</div>}<div><span className={String(product.catalog_status||'stopped').toLowerCase()}>{product.status_label}</span><b>{product.name}</b><strong>{won(product.price)}</strong></div></div>)}</div>{visibleCount<items.length&&<button className="opsLoadMore" type="button" onClick={()=>setVisibleCount(count=>count+18)}>상품 18개 더 보기 <small>{visible.length}/{items.length}</small></button>}</>;
}

function CatalogBucket({title,description,items=[]}) {
  const [open,setOpen]=useState(false);
  return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary><span><b>{title}</b><small>{description}</small></span><em>{items.length}개</em></summary>{open?<CatalogCards items={items}/>:null}</details>;
}

function Cafe24Catalog({ products=[] }) {
  const selling=products.filter(item=>item.catalog_status==='SELLING');
  const soldOut=products.filter(item=>item.catalog_status==='OUT_OF_STOCK');
  const stopped=products.filter(item=>item.catalog_status==='STOPPED');
  const excluded=products.filter(item=>item.catalog_status==='NON_PRODUCT');
  return <article className="panel catalog cafe24Catalog"><PanelTitle tag="CAFE24 CATALOG" title="판매 가능한 상품" right={`${selling.length}개`}/><CatalogCards items={selling}/>{!selling.length&&<Empty>현재 판매중인 Cafe24 상품이 없습니다.</Empty>}<div className="catalogExcludedNote">이벤트·멤버십·쿠폰·리뷰 적립금·사은품 {excluded.length}개는 상품 작업에서 자동 제외했습니다.</div><CatalogBucket title="품절 상품" description="판매가 다시 가능해지면 자동으로 위 목록으로 이동합니다." items={soldOut}/><CatalogBucket title="판매중단 상품" description="판매 또는 진열을 중단한 상품입니다." items={stopped}/></article>;
}

function ProductView({ products, topProducts, masterProducts, channelProducts, productCosts, channelCostSettings, channelShippingRules, shippingRuleEvidence, costCalibration, profitability, financialTrust, financialReadiness, productAdTargets, mapping, unifiedPerformance, productOperations, platform='all', workspace='catalog' }) {
  const [building,setBuilding]=useState(false); const [message,setMessage]=useState('');
  channelCostSettings=channelCostSettings.map(item=>item.platform==='COUPANG'?{...item,cost_calibration:costCalibration}:item);
  const productById=new Map(products.map(item=>[String(item.id),item]));
  const cafeLinkByMaster=new Map(channelProducts.filter(item=>item.platform==='CAFE24').map(item=>[item.master_product_id,item]));
  const sellableMasterProducts=masterProducts.filter(master=>{const link=cafeLinkByMaster.get(master.id),source=link&&productById.get(String(link.external_product_id));return master.is_active!==false&&link?.is_active!==false&&source?.is_sellable===true;});
  const sellableMasterIds=sellableMasterProducts.map(item=>item.id);
  const sellableSet=new Set(sellableMasterIds);
  const sellableCosts=productCosts.filter(item=>sellableSet.has(item.master_product_id));
  const linkedCafe24=sellableMasterProducts.length;
  const isRealExternalProduct=item=>item.platform==='COUPANG'||(item.platform==='NAVER'&&String(item.raw_data?.source_type||'').toUpperCase()==='NAVER_COMMERCE_PRODUCT');
  const linkedOther=channelProducts.filter(item=>isRealExternalProduct(item)&&item.is_active!==false&&sellableSet.has(item.master_product_id)).length;
  async function buildCatalog(){setBuilding(true);setMessage('Cafe24 판매상태와 비상품을 다시 분류하는 중이에요…');try{const response=await fetch('/api/products/bootstrap',{method:'POST'});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'상품 등록 실패');setMessage(`완료 · 판매중 ${result.selling} · 품절 ${result.out_of_stock} · 판매중단 ${result.stopped} · 비상품 제외 ${result.excluded}`);setTimeout(()=>window.location.reload(),900);}catch(error){setMessage(`확인 필요 · ${error.message}`);setBuilding(false);}}
  const profitReady=financialTrust?.allowed?.contribution_profit===true;
  const visibleTargetItems=(productAdTargets?.items||[]).filter(item=>sellableSet.has(item.master_product_id));
  const visibleTargets={...productAdTargets,summary:{...(productAdTargets?.summary||{}),total_products:visibleTargetItems.length,ready_products:visibleTargetItems.filter(item=>item.status==='READY').length,observe_products:visibleTargetItems.filter(item=>item.status==='OBSERVE').length,blocked_products:visibleTargetItems.filter(item=>item.status==='BLOCKED').length,configured_products:visibleTargetItems.filter(item=>item.target_profit_margin_rate!=null).length},items:visibleTargetItems};
  const visiblePerformanceItems=(unifiedPerformance?.items||[]).filter(item=>sellableSet.has(item.master_product_id));
  const visibleUnifiedPerformance={...unifiedPerformance,summary:{...(unifiedPerformance?.summary||{}),active_products:visiblePerformanceItems.length},items:visiblePerformanceItems};
  financialReadiness={...financialReadiness,productAdTargets:visibleTargets,sellableMasterIds};
  const workspaceMeta={
    catalog:['PRODUCT CATALOG','판매 상품목록','판매중 상품을 먼저 보고 품절·판매중단·행사용 항목은 접어서 확인합니다.','product'],
    mappings:['CHANNEL MAPPING','채널 실상품 매칭','Cafe24 판매상품을 기준으로 네이버 스마트스토어와 쿠팡 실상품을 각각 연결합니다. 네이버 광고그룹은 제외합니다.','link'],
    costs:['COST SETTINGS','상품 원가·공통비용','실제 상품 원가와 채널 수수료·배송비를 입력해 이익 계산의 신뢰를 엽니다.','price'],
    profit:['PROFIT ANALYSIS','상품별 실제 이익','채널 매출에서 원가·수수료·배송비·광고비를 뺀 공헌이익을 비교합니다.','growth'],
    offers:['OFFER BUILDER','판매구성 비교','1개·2개·묶음 구성별 실제 이익과 할인 한도를 비교합니다.','product'],
    'ad-targets':['AD TARGETS','상품별 광고 목표','목표 이익률을 기준으로 ROAS·CPA·CPC 안전선을 계산합니다.','target']
  }[workspace]||['PRODUCT CATALOG','판매 상품목록','판매중 상품을 관리합니다.','product'];
  const mappingStatus=sellableMasterProducts.length>0?<article className="panel mappingPanel productMappingStatus"><div className="mappingPanelTitle"><i><HarinIcon name="link" size={21}/></i><PanelTitle tag="REAL COMMERCE PRODUCTS" title="판매중 실상품 연결 현황" right={`${linkedOther+linkedCafe24}개 연결`}/></div><div className="mappingTable"><div className="mappingHeader"><span>기준상품</span><span>Cafe24</span><span>네이버 스마트스토어</span><span>쿠팡</span></div>{sellableMasterProducts.slice(0,20).map(master=>{const links=channelProducts.filter(item=>item.master_product_id===master.id&&item.is_active!==false);const realNaver=links.find(item=>item.platform==='NAVER'&&String(item.raw_data?.source_type||'').toUpperCase()==='NAVER_COMMERCE_PRODUCT');const channelLinks={CAFE24:links.find(item=>item.platform==='CAFE24'),NAVER:realNaver,COUPANG:links.find(item=>item.platform==='COUPANG')};return <div className="mappingRow" key={master.id}><b>{master.name}</b>{['CAFE24','NAVER','COUPANG'].map(p=>{const link=channelLinks[p];return <span key={p} className={link?'mapped':'unmapped'}>{link?link.external_product_name:'미연결'}</span>})}</div>})}</div><p className="mappingCommerceNote"><HarinIcon name="shield" size={16}/> 네이버 광고그룹은 이 표와 상품 연결 계산에서 제외됩니다. 스마트스토어 실상품만 표시합니다.</p></article>:null;
  return <><section className="pageIntro productIntro phase13ProductIntro productWorkspaceIntro"><div className="productWorkspaceTitle"><i><HarinIcon name={workspaceMeta[3]} size={25}/></i><span><span className="eyebrow">{workspaceMeta[0]}</span><h1>{workspaceMeta[1]}</h1><p>{workspaceMeta[2]}</p></span></div>{workspace==='catalog'?<button onClick={buildCatalog} disabled={building}><HarinIcon name="sync" size={17}/>{building?'분류 중…':'Cafe24 상품상태 갱신'}</button>:null}</section>{message&&<div className="syncToast">{message}</div>}<section className="kpiGrid productWorkspaceKpis"><Kpi tone="orange" icon={<HarinIcon name="growth" size={20}/>} label="공헌이익" value={profitReady?won(profitability.contribution_profit):'미산정'} sub={`원가 반영률 ${profitability.cost_coverage_rate==null?'확인 필요':`${num(profitability.cost_coverage_rate).toFixed(0)}%`}`}/><Kpi tone="blue" icon={<HarinIcon name="product" size={20}/>} label="판매중 상품" value={`${sellableMasterProducts.length}개`} sub="매칭·원가 입력 가능"/><Kpi tone="green" icon={<HarinIcon name="store" size={20}/>} label="Cafe24 연결" value={`${linkedCafe24}개`} sub="판매중 기준상품"/><Kpi tone="purple" icon={<HarinIcon name="link" size={20}/>} label="실상품 매칭" value={`${linkedOther}개`} sub={`원가 입력 ${sellableCosts.length}개`}/></section>{workspace==='catalog'?<>{platform==='all'?<UnifiedProductOperationsCenter center={productOperations}/>:null}<HarinProgressiveDetails className="productSourceCatalogDisclosure" eyebrow="원본 상품 자료" title="Cafe24 상품 분류·전체 목록" description="판매중단·품절·제외 상품까지 원본 상태를 확인할 때만 펼쳐보세요." count={`${products.length}개`} action="원본 목록 열기"><Cafe24Catalog products={products}/></HarinProgressiveDetails></>:null}{workspace==='mappings'?<><ProductMappingWorkbench mapping={mapping} masterProducts={sellableMasterProducts}/>{mappingStatus}</>:null}{workspace==='costs'?<><FinancialReadinessCenter readiness={financialReadiness} showAdTargets={false}/><CostManager masterProducts={sellableMasterProducts} productCosts={sellableCosts} channelCostSettings={channelCostSettings} channelShippingRules={channelShippingRules} shippingRuleEvidence={shippingRuleEvidence}/></>:null}{workspace==='profit'?<UnifiedProductPerformance performance={visibleUnifiedPerformance}/>:null}{workspace==='offers'?<ProductGrowthCenter unifiedPerformance={visibleUnifiedPerformance}/>:null}{workspace==='ad-targets'?<ProductAdTargetsCenter center={visibleTargets}/>:null}</>;
}

function UnifiedProductPerformance({ performance={} }) {
  const summary=performance.summary||{}, items=performance.items||[];
  const trusted=performance.financial_trust?.status==='READY';
  return <article className="panel unifiedPerformancePanel"><PanelTitle tag="MASTER PRODUCT PERFORMANCE" title="플랫폼 통합 상품 실적" right={`${performance.period_start||'-'} ~ ${performance.period_end||'-'}`}/><div className="mappingSummaryGrid"><span><small>통합 매출</small><b>{won(summary.revenue)}</b></span><span><small>귀속 광고비</small><b>{won(summary.ad_spend)}</b></span><span><small>공헌이익</small><b>{trusted?won(summary.contribution_profit):'미산정'}</b></span><span><small>실적 상품</small><b>{count(summary.active_products)}개</b></span></div><div className="unifiedPerformanceTable"><div className="unifiedPerformanceHead"><span>기준상품</span><span>Cafe24 실매출</span><span>네이버 전환매출</span><span>쿠팡 실매출</span><span>광고비 · ROAS</span><span>공헌이익</span></div>{items.slice(0,40).map(item=><div className="unifiedPerformanceRow" key={item.master_product_id}><span><b>{item.name}</b><small>주문 {count(item.orders)}건 · 판매/전환 {count(item.units)}개</small></span><em>{won(item.channels?.CAFE24?.revenue)}</em><em>{won(item.channels?.NAVER?.revenue)}</em><em>{won(item.channels?.COUPANG?.revenue)}</em><span><b>{won(item.ad_spend)}</b><small>{!trusted?'미귀속 광고비 연결 후 ROAS 산정':item.roas==null?'ROAS 계산 대기':`ROAS ${num(item.roas).toFixed(0)}%`}</small></span><strong className={trusted&&item.cost_status==='CALCULATED'&&num(item.contribution_profit)<0?'negative':''}>{trusted&&item.cost_status==='CALCULATED'?won(item.contribution_profit):'미산정'}</strong></div>)}</div>{!items.length&&<Empty>상품 매핑 후 채널별 실적이 이 표에 합쳐집니다.</Empty>}<p className="comparisonNote">Cafe24·쿠팡은 주문 실매출, 네이버는 매핑된 광고그룹의 키워드 전환매출입니다. 쿠팡 키워드 광고비는 상품명이 충분히 일치하는 경우에만 귀속하며, 미귀속 {won(summary.coupang_ad_spend_unassigned)}은 상품 ROAS에서 제외합니다. 기대비용에는 반품 {won(summary.return_reserve)}·도서산간 {won(summary.remote_area_reserve)} 충당금이 포함됩니다.</p></article>;
}

function ProductMappingCandidate({ item, masterProducts, onMutate, working, selected, onSelect }) {
  const [masterId,setMasterId]=useState(item.candidates?.[0]?.master_product_id||masterProducts[0]?.id||'');
  const best=item.candidates?.[0];
  const isNaver=item.platform==='NAVER',platformLabel=isNaver?'네이버 스마트스토어':'쿠팡 실상품';
  const chosen=item.candidates?.find(candidate=>candidate.master_product_id===masterId);
  return <div className={`mappingCandidateRow ${selected?'selected':''}`}><HarinBulkCheckbox checked={selected} onChange={event=>onSelect(event.target.checked)} label={`${item.external_product_name} 선택`}/><div className="mappingSource"><i data-platform={item.platform.toLowerCase()}><HarinIcon name={isNaver?'naver':'coupang'} size={20}/></i><div><span className={`platformPill ${item.platform.toLowerCase()}`}>{platformLabel}</span><b>{item.external_product_name}</b><small>외부 ID {item.external_product_id}{item.auto_eligible?' · 자동연결 가능':' · 확인 후 연결'}</small></div></div><div className="mappingSuggestion"><label><HarinIcon name="link" size={16}/> Cafe24 기준상품 선택</label><select value={masterId} onChange={event=>setMasterId(event.target.value)}>{masterProducts.map(master=><option value={master.id} key={master.id}>{master.name}</option>)}</select><small>{chosen?`추천 ${chosen.confidence}% · ${chosen.reasons.join(' · ')}`:best?`최고 추천 ${best.confidence}%`:'추천 점수 없음 · 기준상품 직접 선택'}</small></div><div className="mappingActions"><button disabled={!masterId||Boolean(working)} onClick={()=>onMutate({action:'LINK',platform:item.platform,external_product_id:item.external_product_id,master_product_id:masterId},`${item.platform}:${item.external_product_id}`)}><HarinIcon name="link" size={15}/>연결</button><button className="secondaryButton" disabled={!masterId||Boolean(working)} onClick={()=>onMutate({action:'REJECT',platform:item.platform,external_product_id:item.external_product_id,master_product_id:masterId},`${item.platform}:${item.external_product_id}`)}>이 추천 제외</button></div></div>;
}

function ProductMappingWorkbench({ mapping={}, masterProducts=[] }) {
  const [currentMapping,setCurrentMapping]=useState(mapping);
  useEffect(()=>setCurrentMapping(mapping),[mapping]);
  const summary=currentMapping.summary||{}, candidates=currentMapping.candidates||[], links=currentMapping.links||[];
  const [view,setView]=useStoredState('filter:product-mapping-view','CANDIDATES',['CANDIDATES','LINKED']);
  const [platform,setPlatform]=useStoredState('filter:product-mapping-platform','NAVER',['NAVER','COUPANG']);
  const [working,setWorking]=useState(''),[message,setMessage]=useState('');
  const [search,setSearch]=useState(''),[showCount,setShowCount]=useState(30);
  const channelRows=(view==='CANDIDATES'?candidates:links).filter(item=>item.platform===platform);
  const needle=search.trim().toLowerCase();
  const filteredRows=channelRows.filter(item=>!needle||`${item.external_product_name||''} ${item.external_product_id||''}`.toLowerCase().includes(needle));
  const visibleRows=filteredRows.slice(0,showCount);
  const rowKey=item=>`${item.platform}:${item.external_product_id}`;
  const selection=useHarinBulkSelection({allIds:channelRows.map(rowKey),filteredIds:filteredRows.map(rowKey),visibleIds:visibleRows.map(rowKey)});
  useEffect(()=>setShowCount(30),[platform,view,search]);
  const platformName=platform==='NAVER'?'네이버 스마트스토어':'쿠팡',platformIcon=platform==='NAVER'?'naver':'coupang';
  const candidateCount=Number(platform==='NAVER'?summary.candidate_naver:summary.candidate_coupang)||0,autoCount=Number(platform==='NAVER'?summary.auto_naver:summary.auto_coupang)||0;
  const masterNames=new Map(masterProducts.map(item=>[item.id,item.name]));
  const selectedRows=channelRows.filter(item=>selection.selectedSet.has(rowKey(item)));
  const selectedAutoCount=selectedRows.filter(item=>item.auto_eligible&&item.candidates?.[0]?.master_product_id).length;
  async function mutate(payload,key){
    if(payload.action==='AUTO_LINK_ALL'&&!window.confirm(`${platformName} 고신뢰 후보 ${autoCount}개를 자동 연결할까요?`))return;
    if(payload.action==='UNLINK'&&!window.confirm('이 채널 상품의 연결을 해제할까요?'))return;
    setWorking(key);setMessage('매핑을 저장하는 중…');
    try{
      const response=await fetch('/api/products/mappings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'매핑 저장 실패');
      const refreshedResponse=await fetch('/api/products/mappings',{cache:'no-store'});
      const refreshed=await refreshedResponse.json();
      if(refreshedResponse.ok&&refreshed.ok)setCurrentMapping({summary:refreshed.summary,candidates:refreshed.candidates,links:refreshed.links});
      const bulk=payload.action.startsWith('BULK_');
      setMessage(bulk?`일괄 작업 ${result.result?.processed||0}개 완료${result.result?.failed?` · 실패 ${result.result.failed}개`:''}${result.result?.skipped?` · 조건 불일치 ${result.result.skipped}개`:''} · 목록에 바로 반영했습니다.`:payload.action==='AUTO_LINK_ALL'?`자동연결 ${result.result?.linked||0}개 완료 · 목록에 바로 반영했습니다.`:'매핑을 저장하고 목록에 바로 반영했습니다.');
      selection.clear();
    }catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setWorking('');}
  }
  async function runBulk(action){
    const eligible=action==='BULK_AUTO_LINK'?selectedRows.filter(item=>item.auto_eligible&&item.candidates?.[0]?.master_product_id):action==='BULK_REJECT'?selectedRows.filter(item=>item.candidates?.[0]?.master_product_id):selectedRows;
    if(!eligible.length){setMessage('선택 항목 중 이 작업을 적용할 수 있는 상품이 없습니다.');return;}
    const label=action==='BULK_AUTO_LINK'?'자동 연결':action==='BULK_REJECT'?'추천 제외':'연결 해제';
    if(!window.confirm(`${platformName} 선택 상품 ${eligible.length}개를 ${label}할까요? 다른 채널 상품에는 적용되지 않습니다.`))return;
    await mutate({action,platform,external_product_ids:eligible.map(item=>item.external_product_id)},`BULK:${action}`);
  }
  return <article className="panel productMappingWorkbench productMappingRealOnly"><div className="mappingPlatformTabs" aria-label="실상품 연결 채널">{[['NAVER','naver','네이버 스마트스토어'],['COUPANG','coupang','쿠팡']].map(([id,icon,label])=><button type="button" className={platform===id?'active':''} onClick={()=>setPlatform(id)} key={id}><HarinIcon name={icon} size={18}/><span><b>{label}</b><small>{count(id==='NAVER'?summary.source_naver:summary.source_coupang)}개 수집</small></span></button>)}</div><div className="mappingWorkbenchHead"><div className="mappingWorkbenchTitle"><i><HarinIcon name={platformIcon} size={23}/></i><PanelTitle tag={`${platform} COMMERCE PRODUCT`} title={`${platformName} 실상품 연결`} right={`후보 ${count(candidateCount)}개`}/></div><button disabled={!autoCount||Boolean(working)} onClick={()=>mutate({action:'AUTO_LINK_ALL',platform},'AUTO')}><HarinIcon name="sparkles" size={16}/>{working==='AUTO'?'자동연결 중…':`고신뢰 ${count(autoCount)}개 자동연결`}</button></div><div className="mappingSummaryGrid"><span><HarinIcon name={platformIcon} size={18}/><small>{platformName} 수집 상품</small><b>{count(platform==='NAVER'?summary.source_naver:summary.source_coupang)}개</b></span><span><HarinIcon name="link" size={18}/><small>{platformName} 연결 완료</small><b>{count(platform==='NAVER'?summary.linked_naver:summary.linked_coupang)}개</b></span><span><HarinIcon name="checklist" size={18}/><small>검토 후보</small><b>{count(candidateCount)}개</b></span><span><HarinIcon name="sparkles" size={18}/><small>고신뢰 자동후보</small><b>{count(autoCount)}개</b></span></div><div className="mappingToolbar"><div>{[['CANDIDATES','연결 후보'],['LINKED','연결 완료']].map(([id,label])=><button className={view===id?'active':''} onClick={()=>setView(id)} key={id}>{label}</button>)}</div><label className="mappingSearch"><HarinIcon name="search" size={16}/><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder={`${platformName} 상품명·ID 검색`}/></label><p><HarinIcon name="shield" size={15}/> 네이버 광고그룹 제외</p></div><HarinBulkSelectionBar selectedCount={selection.selectedCount} visibleCount={visibleRows.length} filteredCount={filteredRows.length} visibleState={selection.visibleState} filteredState={selection.filteredState} onToggleVisible={checked=>selection.toggleScope(visibleRows.map(rowKey),checked)} onToggleFiltered={checked=>selection.toggleScope(filteredRows.map(rowKey),checked)} onClear={selection.clear} summary={`${platformName} ${view==='CANDIDATES'?'연결 후보':'연결 완료'}에서만 선택됩니다.`} preview={view==='CANDIDATES'?`선택 중 고신뢰 자동연결 가능 ${selectedAutoCount}개 · 채널 간 상품은 섞이지 않습니다.`:'선택한 연결만 해제하며 다른 채널 매핑은 유지합니다.'}>{view==='CANDIDATES'?<><button type="button" disabled={!selectedAutoCount||Boolean(working)} onClick={()=>runBulk('BULK_AUTO_LINK')}>선택 고신뢰 {selectedAutoCount}개 자동연결</button><button type="button" className="secondary" disabled={!selection.selectedCount||Boolean(working)} onClick={()=>runBulk('BULK_REJECT')}>선택 추천 제외</button></>:<button type="button" className="danger" disabled={!selection.selectedCount||Boolean(working)} onClick={()=>runBulk('BULK_UNLINK')}>선택 연결 해제</button>}</HarinBulkSelectionBar>{message&&<div className="mappingMessage">{message}</div>}{view==='CANDIDATES'?<div className="mappingCandidateList">{visibleRows.map(item=><ProductMappingCandidate item={item} masterProducts={masterProducts} onMutate={mutate} working={working} selected={selection.isSelected(rowKey(item))} onSelect={checked=>selection.toggle(rowKey(item),checked)} key={rowKey(item)}/>)}{!filteredRows.length&&<Empty>검토할 {platformName} 실상품 후보가 없습니다.</Empty>}</div>:<div className="mappingLinkedList">{visibleRows.map(item=><div className={`mappingLinkedRow ${selection.isSelected(rowKey(item))?'selected':''}`} key={item.id}><HarinBulkCheckbox checked={selection.isSelected(rowKey(item))} onChange={event=>selection.toggle(rowKey(item),event.target.checked)} label={`${item.external_product_name} 선택`}/><div><i data-platform={item.platform.toLowerCase()}><HarinIcon name={item.platform==='NAVER'?'naver':'coupang'} size={18}/></i><b>{item.external_product_name}</b><small>→ {masterNames.get(item.master_product_id)||'기준상품 확인 필요'}</small></div><span>{item.match_method==='AUTO'?'자동':'수동'} {item.match_confidence!=null?`${Math.round(num(item.match_confidence)*100)}%`:''}</span><button className="secondaryButton" disabled={Boolean(working)} onClick={()=>mutate({action:'UNLINK',platform:item.platform,external_product_id:item.external_product_id},rowKey(item))}>연결 해제</button></div>)}{!filteredRows.length&&<Empty>연결된 {platformName} 실상품이 없습니다.</Empty>}</div>}{visibleRows.length<filteredRows.length?<button className="opsLoadMore" type="button" onClick={()=>setShowCount(value=>value+30)}>상품 30개 더 보기 <small>{visibleRows.length}/{filteredRows.length}</small></button>:null}<p className="comparisonNote"><HarinIcon name="shield" size={15}/> 네이버 광고그룹은 계속 제외됩니다. 스마트스토어 실상품과 쿠팡 판매상품은 채널별 탭에서 따로 연결합니다.</p></article>;
}

const shippingPlatforms=[['CAFE24','Cafe24'],['NAVER','네이버'],['COUPANG','쿠팡']];

function ShippingRuleManager({ rules=[], evidence={} }) {
  const [rows,setRows]=useState(()=>Object.fromEntries(shippingPlatforms.map(([platform])=>{const rule=rules.find(item=>item.platform===platform)||{};return [platform,{return_shipping_cost:num(rule.return_shipping_cost),return_rate:num(rule.return_rate)*100,remote_area_surcharge:num(rule.remote_area_surcharge),remote_area_rate:num(rule.remote_area_rate)*100,notes:rule.notes||''}]})));
  const [saving,setSaving]=useState(''),[message,setMessage]=useState('');
  function change(platform,field,value){setRows(current=>({...current,[platform]:{...current[platform],[field]:value}}));}
  async function saveRule(platform){if(!window.confirm(`${platform} 반품·도서산간 비용 규칙을 지금 변경할까요?\n변경 전후 값과 실행 결과는 기록에 남습니다.`))return;setSaving(platform);setMessage(`${platform} 변경 전후 확인 후 바로 적용하는 중…`);try{const response=await fetch('/api/costs',{method:'PUT',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({type:'SHIPPING_RULE',platform,...rows[platform]})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'변경 준비 실패');await executeConfirmedFinancialPreview(result);setMessage(`${platform} 비용 규칙 변경 완료 · 실제 저장값도 확인했습니다.`);}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving('');}}
  return <section className="shippingRulePanel"><header><div><span>EXPECTED SHIPPING LOSS</span><b>반품·도서산간 비용 규칙</b><small>주문당 기대비용을 플랫폼별 공헌이익에 자동 배분합니다.</small></div><em>주소정보 저장 안 함</em></header><div className="shippingRuleHead"><span>플랫폼</span><span>반품 택배비</span><span>예상 반품률</span><span>도서산간 추가비</span><span>예상 주문비율</span><span>주문당 충당금</span><span>저장</span></div><div className="shippingRuleRows">{shippingPlatforms.map(([platform,label])=>{const row=rows[platform]||{};const reserve=num(row.return_shipping_cost)*num(row.return_rate)/100+num(row.remote_area_surcharge)*num(row.remote_area_rate)/100;return <div className="shippingRuleRow" key={platform}><b>{label}</b><label><span>반품 택배비</span><input type="number" min="0" step="100" value={row.return_shipping_cost} onChange={event=>change(platform,'return_shipping_cost',event.target.value)}/></label><label><span>예상 반품률</span><input type="number" min="0" max="100" step="0.01" value={row.return_rate} onChange={event=>change(platform,'return_rate',event.target.value)}/><small>%</small></label><label><span>도서산간 추가비</span><input type="number" min="0" step="100" value={row.remote_area_surcharge} onChange={event=>change(platform,'remote_area_surcharge',event.target.value)}/></label><label><span>예상 주문비율</span><input type="number" min="0" max="100" step="0.01" value={row.remote_area_rate} onChange={event=>change(platform,'remote_area_rate',event.target.value)}/><small>%</small></label><strong>{won(reserve)}</strong><button type="button" disabled={saving===platform} onClick={()=>saveRule(platform)}>{saving===platform?'저장 중':'저장'}</button></div>})}</div><div className="shippingEvidence"><div><span>COUPANG ACTUAL SAMPLE</span><b>실데이터 검증 표본</b><small>반품 {count(evidence.return_cases)}건 · 비용 확인 {count(evidence.return_cost_orders)}건 · 실제 반품비 {won(evidence.actual_return_cost)}</small></div><div><small>배송비 주문 {count(evidence.shipping_orders)}건 · 도서산간 추가비 확인 {count(evidence.remote_orders)}건 · 실제 추가비 {won(evidence.actual_remote_cost)}</small><em>신뢰도 {evidence.return_confidence||'LOW'} / {evidence.remote_confidence||'LOW'}</em></div></div>{message&&<small className="costMessage">{message}</small>}<p className="shippingPrivacyNote">개별 배송지나 고객 주소는 이 계산에 저장·사용하지 않습니다. 실비 표본이 충분해질 때까지 입력한 규칙을 유지합니다.</p></section>;
}

const PRODUCT_COST_FILTERS=[['PENDING','확인 필요'],['ALL','전체'],['READY','입력 완료']];
const PRODUCT_COST_LABELS={unit_cost:'상품 원가',packaging_cost:'포장비',other_unit_cost:'기타 단위비'};

function ProductCostQuickGrid({ masterProducts, rows, setRows, saving, onSaveRows }) {
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('PENDING');
  const [page,setPage]=useState(1);
  const [dirtyIds,setDirtyIds]=useState([]);
  const progress=useMemo(()=>summarizeCostProgress(masterProducts,rows),[masterProducts,rows]);
  const searchedProducts=useMemo(()=>filterCostProducts(masterProducts,rows,search),[masterProducts,rows,search]);
  const filteredProducts=useMemo(()=>searchedProducts.filter(product=>{
    if(filter==='READY')return costStatus(rows[product.id]).ready;
    if(filter==='PENDING')return !costStatus(rows[product.id]).ready;
    return true;
  }),[searchedProducts,filter,rows]);
  const pagedProducts=useMemo(()=>paginateCostProducts(filteredProducts,page,COST_PAGE_SIZE),[filteredProducts,page]);
  const dirtyReadyIds=dirtyIds.filter(id=>costStatus(rows[id]).ready);
  const dirtyPendingIds=dirtyIds.filter(id=>!costStatus(rows[id]).ready);

  function changeFilter(next){setFilter(next);setPage(1);}
  function changeSearch(value){setSearch(value);setPage(1);}
  function movePage(next){setPage(paginateCostProducts(filteredProducts,next,COST_PAGE_SIZE).currentPage);}
  function changeCost(productId,field,value){
    setRows(current=>({...current,[productId]:{...(current[productId]||{}),[field]:value}}));
    setDirtyIds(current=>current.includes(productId)?current:[...current,productId]);
  }
  async function saveProducts(products){
    if(!products.length)return;
    const result=await onSaveRows(products);
    if(result?.successIds?.length)setDirtyIds(current=>current.filter(id=>!result.successIds.includes(id)));
  }

  return <section className="productCostWorkbench productCostSpreadsheet">
    <header className="productCostWorkbenchHeader">
      <div><span>빠른 원가 입력</span><h3>판매중 상품을 표에서 바로 입력해요</h3><p>상품 원가 → 포장비 → 기타 비용 순서로 Tab 키를 누르면 다음 칸으로 이동합니다.</p></div>
      <label><HarinIcon name="search" size={18}/><input type="search" value={search} onChange={event=>changeSearch(event.target.value)} placeholder="상품명 검색"/></label>
    </header>
    <div className="productCostProgress" aria-label={`원가 입력 진행률 ${progress.rate}%`}>
      <div><span><b>{progress.ready}</b> / {progress.total}개 입력 완료</span><strong>{progress.rate}%</strong></div>
      <i><em style={{width:`${progress.rate}%`}}/></i>
      <p>{progress.pending?`원가 ${progress.pending}개를 더 확인하면 상품별 실제 이익 계산이 열려요.`:'판매중 상품의 원가 입력이 모두 끝났어요.'}</p>
    </div>
    <div className="productCostQuickToolbar">
      <nav aria-label="원가 입력 상태">{PRODUCT_COST_FILTERS.map(([id,label])=><button type="button" className={filter===id?'active':''} onClick={()=>changeFilter(id)} key={id}>{label}<b>{id==='READY'?progress.ready:id==='PENDING'?progress.pending:progress.total}</b></button>)}</nav>
      <div><span>{dirtyPendingIds.length?`작성 중 ${dirtyPendingIds.length}개 · 빈칸 확인 필요`:dirtyReadyIds.length?'저장할 준비가 됐어요':'바꾼 값이 없습니다.'}</span><button type="button" disabled={!dirtyReadyIds.length||saving==='cost-bulk'} onClick={()=>saveProducts(masterProducts.filter(product=>dirtyReadyIds.includes(product.id)))}><HarinIcon name="checklist" size={16}/>{saving==='cost-bulk'?'저장·검증 중…':`작성한 ${dirtyReadyIds.length}개 저장`}</button></div>
    </div>
    <div className="productCostQuickGrid" role="table" aria-label="판매중 상품 원가 빠른 입력">
      <div className="productCostQuickHead" role="row"><span>판매중 상품</span>{COST_FIELDS.map(field=><span key={field}>{PRODUCT_COST_LABELS[field]}</span>)}<span>입력 상태</span></div>
      <div className="productCostQuickRows">{pagedProducts.items.map(product=>{const row=rows[product.id]||{};const status=costStatus(row);const dirty=dirtyIds.includes(product.id);return <article className={`${dirty?'dirty ':''}${status.ready?'ready':'pending'}`} role="row" key={product.id}>
        <div className="productCostQuickIdentity"><i><HarinIcon name="product" size={18}/></i><span><b>{product.name}</b><small>{product.id}</small></span></div>
        {COST_FIELDS.map(field=><label key={field}><span>{PRODUCT_COST_LABELS[field]}</span><input aria-label={`${product.name} ${PRODUCT_COST_LABELS[field]}`} type="number" min="0" step="100" inputMode="numeric" placeholder="비워두기" value={row[field]??''} onChange={event=>changeCost(product.id,field,event.target.value)}/></label>)}
        <aside><em>{dirty?(status.ready?'저장 대기':status.label):status.label}</em><button type="button" disabled={!dirty||!status.ready||saving==='cost-bulk'} onClick={()=>saveProducts([product])}>{saving==='cost-bulk'?'처리 중':'저장'}</button></aside>
      </article>})}{!pagedProducts.items.length?<Empty>이 조건에 맞는 판매중 상품이 없습니다.</Empty>:null}</div>
      <footer className="productCostPager"><span>{pagedProducts.start}-{pagedProducts.end} / {pagedProducts.total}개</span><div><button type="button" disabled={pagedProducts.currentPage<=1} onClick={()=>movePage(pagedProducts.currentPage-1)}>이전</button><b>{pagedProducts.currentPage} / {pagedProducts.totalPages}</b><button type="button" disabled={pagedProducts.currentPage>=pagedProducts.totalPages} onClick={()=>movePage(pagedProducts.currentPage+1)}>다음</button></div></footer>
    </div>
    <p className="productCostSafety"><HarinIcon name="shield" size={16}/> 모르는 비용은 빈칸으로 두세요. 빈칸은 0원으로 저장하지 않고 수익성 화면에서 ‘판단 보류’로 유지합니다.</p>
  </section>;
}

function CostManager({ masterProducts, productCosts, channelCostSettings, channelShippingRules, shippingRuleEvidence }) {
  const initialChannel=channelCostSettings.find(item=>item.platform==='CAFE24')||{};
  const costCalibration=channelCostSettings.find(item=>item.platform==='COUPANG')?.cost_calibration||{};
  const [channel,setChannel]=useState({commission_rate:num(initialChannel.commission_rate)*100,payment_fee_rate:num(initialChannel.payment_fee_rate)*100,default_shipping_cost:num(initialChannel.default_shipping_cost)});
  const [rows,setRows]=useState(()=>Object.fromEntries(masterProducts.map(item=>{const cost=productCosts.find(row=>row.master_product_id===item.id)||{};return [item.id,Object.fromEntries(COST_FIELDS.map(field=>[field,cost[field]==null?'':num(cost[field])]))]})));
  const [saving,setSaving]=useState(''),[message,setMessage]=useState('');
  async function executeFinancialPayload(payload){const response=await fetch('/api/costs',{method:'PUT',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'변경 준비 실패');await executeConfirmedFinancialPreview(result);return result;}
  async function save(payload,key){if(!window.confirm('입력한 비용을 지금 변경할까요?\n변경 전후 값과 실행 결과는 기록에 남습니다.'))return;setSaving(key);setMessage('변경 전후 확인 후 바로 적용하는 중…');try{await executeFinancialPayload(payload);setMessage('변경 완료 · 실제 저장값 재확인까지 끝났습니다.');}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving('');}}
  async function saveCostRows(products){
    if(!products.length)return {successIds:[]};
    if(!window.confirm(`작성한 상품 원가 ${products.length}개를 한 번에 저장할까요?\n상품마다 변경 전후 값과 실행 결과가 기록됩니다.`))return {successIds:[]};
    setSaving('cost-bulk');setMessage(`상품 원가 ${products.length}개를 순서대로 저장·검증하고 있어요…`);
    const successIds=[],failures=[];
    for(const product of products){
      try{await executeFinancialPayload({type:'PRODUCT',master_product_id:product.id,...(rows[product.id]||{})});successIds.push(product.id);}
      catch(error){failures.push(`${product.name}: ${error.message}`);}
    }
    setMessage(failures.length?`원가 ${successIds.length}개 저장 완료 · ${failures.length}개 확인 필요 (${failures[0]})`:`원가 ${successIds.length}개 저장 완료 · 실제 저장값 확인까지 끝났습니다.`);
    setSaving('');return {successIds,failures};
  }
  async function applyCalibration(){if(!window.confirm('쿠팡 실제 정산값을 기본 비용 설정으로 저장할까요?\n변경 전후 값과 실행 결과는 기록에 남습니다.'))return;setSaving('calibration');setMessage('실제 정산값을 확인하고 바로 적용하는 중…');try{const response=await fetch('/api/costs',{method:'PUT',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({type:'COUPANG_CALIBRATION_APPLY'})});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'보정 준비 실패');await executeConfirmedFinancialPreview(result);setMessage('쿠팡 실제값 적용 완료 · 실제 저장값도 확인했습니다.');}catch(error){setMessage(`확인 필요 · ${error.message}`);}finally{setSaving('');}}
  const commission=costCalibration.commission||{},logistics=costCalibration.logistics||{},assumed=costCalibration.assumed_setting||{},effective=costCalibration.effective_setting||{};
  return <article className="panel costPanel"><PanelTitle tag="PROFIT SETTINGS" title="원가·수수료·택배비" right="서버 계산"/><p className="costGuide">수수료는 퍼센트, 상품 비용과 배송비는 원 단위입니다. 모르는 비용은 0원으로 확정하지 말고 비워두세요.</p><div className="channelCostRow"><b>Cafe24 공통비용</b><label>판매수수료 %<input type="number" min="0" max="100" step="0.01" value={channel.commission_rate} onChange={e=>setChannel({...channel,commission_rate:e.target.value})}/></label><label>결제수수료 %<input type="number" min="0" max="100" step="0.01" value={channel.payment_fee_rate} onChange={e=>setChannel({...channel,payment_fee_rate:e.target.value})}/></label><label>주문당 택배비<input type="number" min="0" step="100" value={channel.default_shipping_cost} onChange={e=>setChannel({...channel,default_shipping_cost:e.target.value})}/></label><button disabled={saving==='channel'} onClick={()=>save({type:'CHANNEL',platform:'CAFE24',...channel},'channel')}>공통비용 저장</button></div><section className={`calibrationCard ${String(costCalibration.confidence||'LOW').toLowerCase()}`}><header><div><span>COUPANG ACTUAL COST</span><b>실제 정산 자동 보정</b><small>{costCalibration.period_start||'-'} ~ {costCalibration.period_end||'-'} · 신뢰도 {costCalibration.confidence||'LOW'}</small></div><em>{costCalibration.auto_applied?'통합 손익에 자동 반영':'수동 설정 유지'}</em></header><div className="calibrationMetrics"><span><small>실제 수수료율</small><b>{commission.actualRate==null?'-':`${(num(commission.actualRate)*100).toFixed(2)}%`}</b><em>수동 {((num(assumed.commission_rate)+num(assumed.payment_fee_rate))*100).toFixed(2)}% · {count(commission.orders)}주문</em></span><span><small>실제 주문당 물류비</small><b>{logistics.actualPerOrder==null?'-':won(logistics.actualPerOrder)}</b><em>수동 {won(assumed.default_shipping_cost)} · {count(logistics.orders)}주문</em></span><span><small>현재 계산 적용값</small><b>{((num(effective.commission_rate)+num(effective.payment_fee_rate))*100).toFixed(2)}%</b><em>주문당 {won(effective.default_shipping_cost)}</em></span></div><footer><p>{costCalibration.auto_applied?'확정 정산 API 수수료와 WING 배송·입출고 실비를 사용합니다. 표본이 부족해지면 자동으로 수동 설정으로 돌아갑니다.':(costCalibration.warnings||[]).join(' ')||'정산 데이터 수집 후 자동 계산됩니다.'}</p><button disabled={!costCalibration.auto_applied||saving==='calibration'} onClick={applyCalibration}>{saving==='calibration'?'반영 중…':'실제값을 기본 설정으로 저장'}</button></footer></section><ShippingRuleManager rules={channelShippingRules} evidence={shippingRuleEvidence}/><ProductCostQuickGrid masterProducts={masterProducts} rows={rows} setRows={setRows} saving={saving} onSaveRows={saveCostRows}/>{message&&<small className="costMessage" role="status">{message}</small>}</article>;
}

export default PlatformProductView;
