'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HarinButton, HarinPageFrame, HarinPageHeader, HarinPictogram, HarinProgressiveDetails } from '../_design-system/harin-ui.js';
import SelectedProductDevelopmentFlow from './selected-product-development-flow.js';

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
    <HarinPageHeader eyebrow="상품개발" title="상품개발센터" description="판매 중인 상품을 골라 시장 조사부터 실험 결과까지 한 상품 안에서 이어서 관리해요." icon="growth" tone="lavender" note="상품을 바꿔도 시장 근거·경쟁사·실험·결과는 서로 섞이지 않습니다." metrics={metrics} actions={<HarinButton as={Link} href="/products/catalog" variant="secondary" icon="product">판매상품 확인</HarinButton>}/>

    <section className="marketProductPicker" aria-labelledby="market-product-picker-title">
      <div><HarinPictogram icon="product" tone="amber" size={24}/><span><small>개발할 상품</small><h2 id="market-product-picker-title">어떤 상품을 키워볼까요?</h2><p>판매 중 상품만 표시하고 이전 개발 기록이 있으면 그 자리에서 이어갑니다.</p></span></div>
      <label><span>판매 중 기준상품</span><select value={selectedProduct} onChange={event=>{setSelectedProduct(event.target.value);setMessage('');}} disabled={!products.length}>{!products.length?<option value="">판매 중 상품이 없습니다</option>:products.map(product=><option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
      <aside><span><small>현재 선택</small><b>{selected?.name||'상품을 선택해주세요'}</b><em>{selected?`${won(selected.selling_price)} · ${selected.development?.label}`:'판매상품 목록을 먼저 확인해주세요.'}</em></span><HarinButton variant="primary" icon="growth" onClick={()=>openProject()} disabled={busy||!selectedProduct}>{busy?'개발공간 여는 중…':selected?.project?'이 상품 계속 개발하기':'새 상품개발 시작하기'}</HarinButton></aside>
      {message?<p className="marketProjectMessage" role="status">{message}</p>:null}
    </section>

    <SelectedProductDevelopmentFlow selected={selected} onOpen={()=>openProject()} busy={busy}/>

    <HarinProgressiveDetails eyebrow="페이지별 AI" title="시장·전환 프로젝트 AI는 어떻게 동작하나요?" description="다른 페이지 AI와 합치지 않고 선택 상품의 검수된 근거만 사용합니다." count="사용 시작 전 · 비용 0원">
      <div className="marketAiPreview"><HarinPictogram icon="ai" tone="lavender"/><span><b>현재 외부 AI 호출은 잠겨 있어요.</b><p>자료실과 시장·경쟁 근거가 준비된 뒤 이 상품 프로젝트 안에서만 분석하도록 연결합니다.</p></span></div>
    </HarinProgressiveDetails>
  </HarinPageFrame>;
}
