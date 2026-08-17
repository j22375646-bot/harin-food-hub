'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HarinBadge, HarinButton, HarinCard, HarinPageFrame, HarinPageHeader, HarinPictogram, HarinProgressiveDetails, HarinSectionHeading } from '../_design-system/harin-ui.js';

const won=value=>value==null?'가격 확인 필요':`${Math.round(Number(value)||0).toLocaleString('ko-KR')}원`;

export default function MarketProjectHome({initialData}){
  const router=useRouter();
  const products=initialData.products||[];
  const projects=initialData.projects||[];
  const recentProduct=projects[0]?.master_product_id;
  const [selectedProduct,setSelectedProduct]=useState(recentProduct||products[0]?.id||'');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(initialData.error||'');
  const selected=useMemo(()=>products.find(item=>item.id===selectedProduct)||null,[products,selectedProduct]);

  async function openProject(){
    if(!selectedProduct){setMessage('분석할 판매 중 상품을 먼저 선택해주세요.');return;}
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/market-intelligence/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({master_product_id:selectedProduct})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'프로젝트를 열지 못했습니다.');
      router.push(result.href);
      router.refresh();
    }catch(error){setMessage(error.message);setBusy(false);}
  }

  const metrics=[
    {label:'선택 가능한 상품',value:`${initialData.summary?.saleable_products||0}개`,description:'판매 중 기준상품'},
    {label:'진행 중 프로젝트',value:`${initialData.summary?.active_projects||0}개`,description:'상품별 독립 공간'},
    {label:'저장된 분석 버전',value:`${initialData.summary?.versions||0}개`,description:'변경 이력 보존'}
  ];
  return <HarinPageFrame kind="analysis" className="marketProjectHome">
    <HarinPageHeader eyebrow="MARKET · CONVERSION" title="상품을 고르고 성장 프로젝트를 시작해요" description="판매 중인 어떤 상품도 같은 흐름으로 시장·경쟁·구매전환을 분석할 수 있어요." icon="growth" tone="lavender" note="상품을 바꿔도 이전 상품의 경쟁사·근거·수치는 섞이지 않습니다." metrics={metrics} actions={<HarinButton as={Link} href="/products/catalog" variant="secondary" icon="product">판매상품 확인</HarinButton>}/>

    <section className="marketProductPicker" aria-labelledby="market-product-picker-title">
      <div><HarinPictogram icon="product" tone="amber" size={24}/><span><small>분석할 상품</small><h2 id="market-product-picker-title">어떤 상품을 살펴볼까요?</h2><p>판매 중 상품만 표시하며, 기존 프로젝트가 있으면 이어서 열어요.</p></span></div>
      <label><span>판매 중 기준상품</span><select value={selectedProduct} onChange={event=>{setSelectedProduct(event.target.value);setMessage('');}} disabled={!products.length}>{!products.length?<option value="">판매 중 상품이 없습니다</option>:products.map(product=><option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
      <aside><span><small>현재 선택</small><b>{selected?.name||'상품을 선택해주세요'}</b><em>{selected?won(selected.selling_price):'판매상품 목록을 먼저 확인해주세요.'}</em></span><HarinButton variant="primary" icon="growth" onClick={openProject} disabled={busy||!selectedProduct}>{busy?'프로젝트 여는 중…':selected?.project?'이 프로젝트 계속하기':'새 프로젝트 만들기'}</HarinButton></aside>
      {message?<p className="marketProjectMessage" role="status">{message}</p>:null}
    </section>

    <section className="marketFlowSection">
      <HarinSectionHeading eyebrow="REUSABLE WORKFLOW" title="모든 상품을 같은 네 단계로 살펴봐요" description="화면 구조만 재사용하고, 근거와 숫자는 선택한 상품별로 새로 확인합니다." icon="growth"/>
      <div className="marketFlowGrid">
        {[['01','database','blue','자료실','파일·출처·OCR 근거'],['02','analysis','lavender','시장 분석','시장범위·수요 신호'],['03','search','pink','경쟁 분석','리뷰 불편·차별화'],['04','target','mint','구매 전환','장벽·구성·재구매'],['05','store','amber','B2B·조달','납품 준비·공고 연결']].map(([number,icon,tone,title,description])=><article data-tone={tone} key={number}><i>{number}</i><HarinPictogram icon={icon} tone={tone} size={20}/><span><b>{title}</b><small>{description}</small></span></article>)}
      </div>
    </section>

    <section className="marketRecentSection">
      <HarinSectionHeading eyebrow="RECENT PROJECTS" title="최근 프로젝트" description="상품마다 저장된 분석 버전과 마지막 작업 위치를 다시 열 수 있어요." icon="clock" aside={<HarinBadge tone="lavender">{projects.length}개</HarinBadge>}/>
      {projects.length?<div className="marketProjectGrid">{projects.map(project=><HarinCard className="marketProjectCard" interactive key={project.id}><header><HarinPictogram icon="growth" tone="lavender" size={20}/><HarinBadge tone={project.status==='ACTIVE'?'success':'neutral'}>{project.status==='ACTIVE'?'진행 중':'초안'}</HarinBadge></header><div><small>{project.product?.name}</small><h3>{project.project_name}</h3><p>{won(project.product?.selling_price)} · 버전 {project.active_version}</p></div><footer><span>상품별 근거 분리 저장</span><HarinButton as={Link} href={project.href} variant="secondary" icon="chevron">계속하기</HarinButton></footer></HarinCard>)}</div>:<section className="marketEmptyProjects"><HarinPictogram icon="growth" tone="lavender" size={26}/><div><b>아직 만든 프로젝트가 없어요</b><p>위에서 판매 중 상품을 선택하면 첫 프로젝트가 만들어집니다.</p></div></section>}
    </section>

    <HarinProgressiveDetails eyebrow="페이지별 AI" title="시장·전환 프로젝트 AI는 어떻게 동작하나요?" description="다른 페이지 AI와 합치지 않고 선택 상품의 검수된 근거만 사용합니다." count="사용 시작 전 · 비용 0원">
      <div className="marketAiPreview"><HarinPictogram icon="ai" tone="lavender"/><span><b>현재 외부 AI 호출은 잠겨 있어요.</b><p>자료실과 시장·경쟁 근거가 준비된 뒤 이 상품 프로젝트 안에서만 분석하도록 연결합니다.</p></span></div>
    </HarinProgressiveDetails>
  </HarinPageFrame>;
}
