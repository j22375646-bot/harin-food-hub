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

  async function openProject(productId=selectedProduct){
    if(!productId){setMessage('개발할 판매 중 상품을 먼저 선택해주세요.');return;}
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/market-intelligence/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({master_product_id:productId})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'프로젝트를 열지 못했습니다.');
      router.push(result.href);
      router.refresh();
    }catch(error){setMessage(error.message);setBusy(false);}
  }

  const metrics=[
    {label:'선택 가능한 상품',value:`${initialData.summary?.saleable_products||0}개`,description:'판매 중 기준상품'},
    {label:'진행 중 프로젝트',value:`${initialData.summary?.active_projects||0}개`,description:'상품별 독립 공간'},
    {label:'연결된 A/B 실험',value:`${initialData.summary?.experiments||0}개`,description:'선택 상품에만 연결'},
    {label:'결과 정리 완료',value:`${initialData.summary?.completed_products||0}개`,description:'다음 개발에 재사용'}
  ];
  return <HarinPageFrame kind="analysis" className="marketProjectHome">
    <HarinPageHeader eyebrow="PRODUCT DEVELOPMENT" title="상품개발센터" description="판매 중인 상품을 골라 시장 조사부터 실험 결과까지 한 상품 안에서 이어서 관리해요." icon="growth" tone="lavender" note="상품을 바꿔도 시장 근거·경쟁사·실험·결과는 서로 섞이지 않습니다." metrics={metrics} actions={<HarinButton as={Link} href="/products/catalog" variant="secondary" icon="product">판매상품 확인</HarinButton>}/>

    <section className="marketProductPicker" aria-labelledby="market-product-picker-title">
      <div><HarinPictogram icon="product" tone="amber" size={24}/><span><small>개발할 상품</small><h2 id="market-product-picker-title">어떤 상품을 키워볼까요?</h2><p>판매 중 상품만 표시하고 이전 개발 기록이 있으면 그 자리에서 이어갑니다.</p></span></div>
      <label><span>판매 중 기준상품</span><select value={selectedProduct} onChange={event=>{setSelectedProduct(event.target.value);setMessage('');}} disabled={!products.length}>{!products.length?<option value="">판매 중 상품이 없습니다</option>:products.map(product=><option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
      <aside><span><small>현재 선택</small><b>{selected?.name||'상품을 선택해주세요'}</b><em>{selected?`${won(selected.selling_price)} · ${selected.development?.label}`:'판매상품 목록을 먼저 확인해주세요.'}</em></span><HarinButton variant="primary" icon="growth" onClick={()=>openProject()} disabled={busy||!selectedProduct}>{busy?'개발공간 여는 중…':selected?.project?'이 상품 계속 개발하기':'새 상품개발 시작하기'}</HarinButton></aside>
      {message?<p className="marketProjectMessage" role="status">{message}</p>:null}
    </section>

    <section className="marketFlowSection">
      <HarinSectionHeading eyebrow="REUSABLE WORKFLOW" title="상품마다 같은 흐름으로 끝까지 이어가요" description="개발 순서는 재사용하되 근거와 숫자, 실험 결과는 선택 상품에만 저장합니다." icon="growth"/>
      <div className="marketFlowGrid">
        {[['01','database','blue','자료 준비','파일·출처·상품 근거'],['02','analysis','lavender','시장 분석','시장범위·수요 신호'],['03','search','pink','경쟁 분석','리뷰 불편·차별화'],['04','target','mint','전환 설계','장벽·구성·재구매'],['05','experiments','amber','A/B 실험','가설·표본·성과 비교'],['06','analysis','blue','결과 학습','7·14일 검증·다음 개발']].map(([number,icon,tone,title,description])=><article data-tone={tone} key={number}><i>{number}</i><HarinPictogram icon={icon} tone={tone} size={20}/><span><b>{title}</b><small>{description}</small></span></article>)}
      </div>
    </section>

    <section className="marketRecentSection">
      <HarinSectionHeading eyebrow="PRODUCT BOARD" title="상품별 개발 현황" description="판매 중인 상품의 시장 준비·실험·결과 단계를 한눈에 비교하고 바로 이어가세요." icon="clock" aside={<HarinBadge tone="lavender">{products.length}개 상품</HarinBadge>}/>
      {products.length?<div className="marketProjectGrid">{products.map(product=>{const project=product.project,development=product.development||{};const experimentHref=`/ab-tests?master_product_id=${encodeURIComponent(product.id)}${project?`&market_project_id=${encodeURIComponent(project.id)}`:''}`;return <HarinCard className="marketProjectCard marketDevelopmentCard" interactive key={product.id}><header><HarinPictogram icon="growth" tone={development.key==='LEARNED'?'mint':'lavender'} size={20}/><HarinBadge tone={development.progress>=80?'success':development.progress?'lavender':'neutral'}>{development.label}</HarinBadge></header><div><small>{won(product.selling_price)}</small><h3>{product.name}</h3><p>{project?`${project.project_name} · 버전 ${project.active_version}`:'아직 상품개발 기록이 없습니다.'}</p></div><div className="marketDevelopmentProgress" aria-label={`${product.name} 개발 진행률 ${development.progress||0}%`}><span><i style={{width:`${development.progress||0}%`}}/></span><b>{development.progress||0}%</b></div><div className="marketDevelopmentFacts"><span><small>실행계획</small><b>{development.plans||0}개</b></span><span><small>A/B 실험</small><b>{development.experiments||0}개</b></span><span><small>결과 기록</small><b>{development.reports||0}개</b></span></div><footer><HarinButton variant="secondary" icon="growth" onClick={()=>openProject(product.id)} disabled={busy}>{project?'개발 이어가기':'개발 시작'}</HarinButton><HarinButton as={Link} href={experimentHref} variant="secondary" icon="experiments">이 상품 실험</HarinButton></footer></HarinCard>;})}</div>:<section className="marketEmptyProjects"><HarinPictogram icon="growth" tone="lavender" size={26}/><div><b>판매 중인 기준상품이 없어요</b><p>상품목록에서 판매 중 상품을 준비하면 개발 프로젝트를 시작할 수 있습니다.</p></div></section>}
    </section>

    <HarinProgressiveDetails eyebrow="페이지별 AI" title="시장·전환 프로젝트 AI는 어떻게 동작하나요?" description="다른 페이지 AI와 합치지 않고 선택 상품의 검수된 근거만 사용합니다." count="사용 시작 전 · 비용 0원">
      <div className="marketAiPreview"><HarinPictogram icon="ai" tone="lavender"/><span><b>현재 외부 AI 호출은 잠겨 있어요.</b><p>자료실과 시장·경쟁 근거가 준비된 뒤 이 상품 프로젝트 안에서만 분석하도록 연결합니다.</p></span></div>
    </HarinProgressiveDetails>
  </HarinPageFrame>;
}
