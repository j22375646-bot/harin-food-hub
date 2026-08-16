'use client';

import { useEffect, useMemo, useState } from 'react';

const money = value => value == null ? '확인 필요' : `${Math.round(Number(value || 0)).toLocaleString('ko-KR')}원`;
const number = value => Number(value || 0);
const lines = value => String(value || '').split('\n').map(item => item.trim()).filter(Boolean);
const joined = value => Array.isArray(value) ? value.join('\n') : '';
const statusLabel = { SAFE:'광고·할인 검토 가능', WATCH:'이익 적음', LOSS:'팔수록 손실', CHECK_REQUIRED:'원가 확인 필요' };
const typeLabel = { SINGLE:'1개', DOUBLE:'2개', BUNDLE:'묶음', GIFT:'사은품 포함' };
const roleLabel = { STANDARD:'일반 판매상품', OPTION:'선택 옵션', BUNDLE:'묶음 상품', GIFT:'사은품' };

function GrowthHelp({ title, summary, children }) {
  return <details className="growthHelp"><summary><span><b>도움말 · {title}</b><small>{summary}</small></span><em>열어서 쉬운 예시 보기</em></summary><div>{children}</div></details>;
}

function Field({ label, hint, children }) {
  return <label className="growthField"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;
}

function ProfitResult({ calculation }) {
  const result=calculation||{};
  return <div className={`offerResult ${String(result.status||'CHECK_REQUIRED').toLowerCase()}`}>
    <span><small>실제 이익</small><b>{money(result.actual_profit)}</b></span>
    <span><small>이익률</small><b>{result.margin_rate==null?'확인 필요':`${result.margin_rate}%`}</b></span>
    <span><small>추가 할인 한도</small><b>{money(result.maximum_additional_discount)}</b></span>
    <span><small>광고비 손익분기</small><b>{money(result.break_even_ad_cost)}</b></span>
    <em>{statusLabel[result.status]||'확인 필요'}</em>
    {result.warnings?.length?<p>{result.warnings.join(' ')}</p>:null}
  </div>;
}

export default function ProductGrowthCenter({ unifiedPerformance={} }) {
  const [data,setData]=useState(null);
  const [selectedId,setSelectedId]=useState('');
  const [profile,setProfile]=useState(null);
  const [offers,setOffers]=useState([]);
  const [checklist,setChecklist]=useState({});
  const [notes,setNotes]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState('');
  const [message,setMessage]=useState('');

  async function load() {
    setLoading(true);
    try {
      const response=await fetch('/api/products/growth-center',{cache:'no-store'});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'상품 성장센터를 불러오지 못했습니다.');
      setData(result); setSelectedId(current=>current||result.pilot_product_id||result.items?.[0]?.master_product?.id||'');
    } catch(error) { setMessage(`확인 필요 · ${error.message}`); }
    finally { setLoading(false); }
  }

  useEffect(()=>{load();},[]);
  const active=useMemo(()=>data?.items?.find(item=>item.master_product.id===selectedId)||null,[data,selectedId]);
  useEffect(()=>{
    if(!active)return;
    setProfile({...active.profile});
    setOffers(active.offers.map(({calculation,...offer})=>({...offer,calculation})));
    setChecklist({...active.checklist.items});
    setNotes(active.checklist.notes||'');
  },[active]);

  async function save(action,payload) {
    setSaving(action); setMessage('서버에서 실제 이익과 입력 내용을 확인하는 중입니다…');
    try {
      const response=await fetch('/api/products/growth-center',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({action,master_product_id:selectedId,...payload})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'저장하지 못했습니다.');
      setData(result); setMessage('저장 완료 · 실제 이익을 서버에서 다시 계산했습니다.');
    } catch(error) { setMessage(`확인 필요 · ${error.message}`); }
    finally { setSaving(''); }
  }

  function profileValue(field,value){setProfile(current=>({...current,[field]:value}));}
  function offerValue(index,field,value){setOffers(current=>current.map((offer,i)=>i===index?{...offer,[field]:value}:offer));}
  function addOffer(){setOffers(current=>[...current,{name:`새 구성 ${current.length+1}`,offer_type:'BUNDLE',platform:'CAFE24',quantity:3,list_price:0,sale_price:0,customer_shipping_revenue:0,shipping_cost_override:null,gift_cost:0,extra_packaging_cost:0,ad_cost_per_order:0,is_active:true,calculation:{status:'CHECK_REQUIRED',warnings:['저장하면 서버에서 실제 이익을 계산합니다.']}}]);}
  function removeOffer(index){if(offers.length>1)setOffers(current=>current.filter((_,i)=>i!==index));}

  const performance=unifiedPerformance.items?.find(item=>item.master_product_id===selectedId);
  const progress=active?.completion||{};
  const best=active?.best_offer;
  const steps=[
    ['1','상품 정보',progress.profile_done===progress.profile_total,`${progress.profile_done||0}/${progress.profile_total||7}`],
    ['2','원가 입력',active?.cost_ready===true,active?.cost_ready?'완료':'확인 필요'],
    ['3','구성별 이익',(progress.offers_done||0)>=3,`${progress.offers_done||0}/3`],
    ['4','상세페이지',progress.checklist_done===progress.checklist_total,`${progress.checklist_done||0}/${progress.checklist_total||10}`]
  ];

  return <article className="panel growthCenter" id="product-growth-center">
    <header className="growthCenterHead"><div><span>판매구성 · 이익 비교</span><h2>상품 성장센터</h2><p>할인이나 광고를 늘리기 전에 이 상품이 실제로 돈을 남기는지 확인합니다.</p></div><label><span>분석할 상품</span><select value={selectedId} onChange={event=>setSelectedId(event.target.value)}>{data?.items?.map(item=><option value={item.master_product.id} key={item.master_product.id}>{item.master_product.name}</option>)}</select></label></header>
    <GrowthHelp title="상품 성장센터는 무엇을 하나요?" summary="상품 정보부터 구성별 이익, 상세페이지 준비까지 한 순서로 점검합니다.">
      <p><b>쉽게 말하면:</b> 1개를 팔 때와 묶음으로 팔 때 각각 얼마가 남는지 계산하는 작업장입니다.</p>
      <p><b>예:</b> 2개 묶음 판매가가 30,000원이고 원가·수수료·배송·광고비가 23,000원이면 실제 이익은 7,000원입니다.</p>
      <p><b>사용 순서:</b> 상품 정보 → 원가 입력 → 구성 저장 → 상세페이지 점검 순으로 완료하세요. 원가가 없으면 이익을 0원으로 표시하지 않습니다.</p>
    </GrowthHelp>
    {message&&<div className="growthMessage">{message}</div>}
    {loading?<div className="growthLoading">상품 정보와 비용을 연결하는 중입니다…</div>:!active||!profile?<div className="growthLoading">기준상품을 먼저 만들어주세요.</div>:<>
      <section className="growthSummary">
        <span><small>준비 진행률</small><b>{progress.percent||0}%</b><em>네 단계 합산</em></span>
        <span className={active.cost_ready?'good':'warning'}><small>원가 상태</small><b>{active.cost_ready?'입력됨':'확인 필요'}</b><em>{active.cost_ready?'구성별 계산 가능':'원가 입력부터 진행'}</em></span>
        <span><small>가장 많이 남는 구성</small><b>{best?.name||'확인 필요'}</b><em>{best?`${money(best.actual_profit)} · 이익률 ${best.margin_rate}%`:'원가와 판매가를 입력하세요'}</em></span>
        <span><small>3채널 실적</small><b>{performance?money(performance.revenue):'연결 대기'}</b><em>{performance?`주문 ${number(performance.orders).toLocaleString('ko-KR')}건`:'상품 매핑 후 표시'}</em></span>
      </section>
      <section className="growthSteps">{steps.map(([numberValue,label,done,state])=><span className={done?'done':'todo'} key={label}><i>{done?'✓':numberValue}</i><b>{label}</b><small>{state}</small></span>)}</section>

      <section className="growthBlock">
        <div className="growthBlockHead"><div><span>STEP 1</span><h3>상품 정보 파일</h3><p>누구에게, 언제, 어떤 말로 팔지 적어두는 상품별 기준 문서입니다.</p></div><button disabled={saving==='SAVE_PROFILE'} onClick={()=>save('SAVE_PROFILE',{profile:{...profile,purchase_situations:lines(profile.purchase_situations_text??joined(profile.purchase_situations)),hesitation_reasons:lines(profile.hesitation_reasons_text??joined(profile.hesitation_reasons)),prohibited_phrases:lines(profile.prohibited_phrases_text??joined(profile.prohibited_phrases))}})}>{saving==='SAVE_PROFILE'?'저장 중…':'상품 정보 저장'}</button></div>
        <GrowthHelp title="무엇을 적어야 하나요?" summary="멋진 문장보다 실제 고객이 이해할 수 있는 쉬운 말을 적습니다."><p><b>주요 고객 예:</b> 카페인 대신 따뜻한 차를 찾는 30~50대 고객</p><p><b>망설이는 이유 예:</b> 맛이 너무 쓰지 않을까, 어떻게 우려야 할까, 가격만큼 양이 충분할까</p><p><b>사용 금지 문구:</b> 질병을 치료·예방한다고 오해할 수 있는 표현은 적어두고 판매 문구에서 제외하세요.</p></GrowthHelp>
        <div className="growthProfileGrid">
          <Field label="상품 구분"><select value={profile.product_role||'STANDARD'} onChange={event=>profileValue('product_role',event.target.value)}>{Object.entries(roleLabel).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></Field>
          <Field label="상품 한 줄 설명" hint="예: 작수차 티백 20개입, 따뜻하거나 차갑게 우려 마시는 차"><input value={profile.product_summary||''} onChange={event=>profileValue('product_summary',event.target.value)}/></Field>
          <Field label="주요 고객" hint="가장 먼저 사고 싶은 사람 한 부류"><textarea value={profile.target_customer||''} onChange={event=>profileValue('target_customer',event.target.value)}/></Field>
          <Field label="구매 상황" hint="한 줄에 하나씩 입력"><textarea value={profile.purchase_situations_text??joined(profile.purchase_situations)} onChange={event=>profileValue('purchase_situations_text',event.target.value)}/></Field>
          <Field label="고객이 망설이는 이유" hint="한 줄에 하나씩 입력"><textarea value={profile.hesitation_reasons_text??joined(profile.hesitation_reasons)} onChange={event=>profileValue('hesitation_reasons_text',event.target.value)}/></Field>
          <Field label="핵심 판매 문구" hint="과장 없이 가장 중요한 장점 하나"><textarea value={profile.core_message||''} onChange={event=>profileValue('core_message',event.target.value)}/></Field>
          <Field label="사용 금지 문구" hint="질병 치료처럼 오해될 표현을 한 줄에 하나씩"><textarea value={profile.prohibited_phrases_text??joined(profile.prohibited_phrases)} onChange={event=>profileValue('prohibited_phrases_text',event.target.value)}/></Field>
          <Field label="먹는 법·사용 안내" hint="용량, 시간, 횟수, 보관법을 쉬운 말로"><textarea value={profile.usage_guide||''} onChange={event=>profileValue('usage_guide',event.target.value)}/></Field>
        </div>
      </section>

      <section className="growthBlock costGuideBlock">
        <div className="growthBlockHead"><div><span>STEP 2</span><h3>비용 입력 안내</h3><p>상품 원가, 포장비, 수수료, 택배비가 있어야 실제 이익을 믿을 수 있습니다.</p></div><button onClick={()=>document.querySelector('.costPanel')?.scrollIntoView({behavior:'smooth',block:'start'})}>원가 입력칸으로 이동</button></div>
        <div className="costGuideSteps"><span><i>1</i><b>상품 원가</b><small>내용물 1개의 매입·제조 원가</small></span><span><i>2</i><b>포장·기타비</b><small>박스, 라벨, 완충재 등</small></span><span><i>3</i><b>채널 수수료</b><small>판매·결제 수수료율</small></span><span><i>4</i><b>배송·광고비</b><small>주문 한 건에 드는 비용</small></span></div>
      </section>

      <section className="growthBlock">
        <div className="growthBlockHead"><div><span>STEP 3</span><h3>1개·2개·묶음 실제 이익 비교</h3><p>판매가만 비교하지 않고 원가·수수료·배송비·사은품·광고비를 모두 뺍니다.</p></div><div className="growthHeadActions"><button className="secondary" onClick={addOffer}>구성 추가</button><button disabled={saving==='SAVE_OFFERS'} onClick={()=>save('SAVE_OFFERS',{offers:offers.map(({calculation,suggested,id,...offer})=>offer)})}>{saving==='SAVE_OFFERS'?'계산 중…':'구성 저장·계산'}</button></div></div>
        <GrowthHelp title="추가 할인 한도와 광고비 손익분기" summary="얼마까지 더 써도 손실이 나지 않는지 보여줍니다."><p><b>추가 할인 한도 4,000원:</b> 다른 조건이 그대로라면 4,000원을 더 할인하면 이익이 0원이 됩니다. 실제 할인은 안전 여유를 남기세요.</p><p><b>광고비 손익분기 6,000원:</b> 주문 1건을 만드는 광고비가 6,000원을 넘으면 손실입니다.</p></GrowthHelp>
        <div className="offerList">{offers.map((offer,index)=><article className="offerCard" key={`${offer.id||'new'}-${index}`}>
          <header><Field label="구성 이름"><input value={offer.name||''} onChange={event=>offerValue(index,'name',event.target.value)}/></Field><Field label="구분"><select value={offer.offer_type||'BUNDLE'} onChange={event=>offerValue(index,'offer_type',event.target.value)}>{Object.entries(typeLabel).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></Field><Field label="판매 채널"><select value={offer.platform||'CAFE24'} onChange={event=>offerValue(index,'platform',event.target.value)}><option value="CAFE24">Cafe24</option><option value="NAVER">네이버</option><option value="COUPANG">쿠팡</option></select></Field><Field label="수량"><input type="number" min="1" max="100" value={offer.quantity??1} onChange={event=>offerValue(index,'quantity',event.target.value)}/></Field><Field label="정상가"><input type="number" min="0" step="100" value={offer.list_price??0} onChange={event=>offerValue(index,'list_price',event.target.value)}/></Field><Field label="실제 판매가"><input type="number" min="0" step="100" value={offer.sale_price??0} onChange={event=>offerValue(index,'sale_price',event.target.value)}/></Field><button className="removeOffer" disabled={offers.length<=1} onClick={()=>removeOffer(index)}>삭제</button></header>
          <details className="offerExtras"><summary>배송비·사은품·포장·광고비 입력</summary><div><Field label="고객이 내는 배송비"><input type="number" min="0" step="100" value={offer.customer_shipping_revenue??0} onChange={event=>offerValue(index,'customer_shipping_revenue',event.target.value)}/></Field><Field label="실제 택배비 덮어쓰기" hint="비우면 채널 기본 택배비"><input type="number" min="0" step="100" value={offer.shipping_cost_override??''} onChange={event=>offerValue(index,'shipping_cost_override',event.target.value)}/></Field><Field label="사은품 원가"><input type="number" min="0" step="100" value={offer.gift_cost??0} onChange={event=>offerValue(index,'gift_cost',event.target.value)}/></Field><Field label="추가 포장비"><input type="number" min="0" step="100" value={offer.extra_packaging_cost??0} onChange={event=>offerValue(index,'extra_packaging_cost',event.target.value)}/></Field><Field label="주문당 광고비"><input type="number" min="0" step="100" value={offer.ad_cost_per_order??0} onChange={event=>offerValue(index,'ad_cost_per_order',event.target.value)}/></Field></div></details>
          <ProfitResult calculation={offer.calculation}/>
        </article>)}</div>
      </section>

      <section className="growthBlock">
        <div className="growthBlockHead"><div><span>STEP 4</span><h3>상세페이지 점검표</h3><p>고객이 망설이는 이유에 답하고, 필요한 정보와 안전한 표현을 확인합니다.</p></div><button disabled={saving==='SAVE_CHECKLIST'} onClick={()=>save('SAVE_CHECKLIST',{items:checklist,notes})}>{saving==='SAVE_CHECKLIST'?'저장 중…':'점검표 저장'}</button></div>
        <div className="detailChecklist">{data.checklist_items.map(item=><label className={checklist[item.key]===true?'checked':''} key={item.key}><input type="checkbox" checked={checklist[item.key]===true} onChange={event=>setChecklist(current=>({...current,[item.key]:event.target.checked}))}/><span><b>{item.label}</b><small>{checklist[item.key]===true?'확인 완료':'아직 확인하지 않음'}</small></span></label>)}</div>
        <Field label="상세페이지 점검 메모" hint="바꿔야 할 사진, 문구, 표를 적어두세요."><textarea className="checklistNotes" value={notes} onChange={event=>setNotes(event.target.value)}/></Field>
      </section>

      <section className="growthBlock channelGrowthBlock">
        <div className="growthBlockHead"><div><span>3-CHANNEL RESULT</span><h3>네이버·Cafe24·쿠팡 통합 성과</h3><p>선택한 기준상품에 연결된 채널 실적만 나란히 비교합니다.</p></div></div>
        <div className="channelGrowthGrid">{[['NAVER','네이버'],['CAFE24','Cafe24'],['COUPANG','쿠팡']].map(([platform,label])=>{const channel=performance?.channels?.[platform]||{};return <span key={platform}><small>{label}</small><b>{money(channel.revenue)}</b><em>주문 {number(channel.orders).toLocaleString('ko-KR')}건 · 판매/전환 {number(channel.units).toLocaleString('ko-KR')}개</em></span>})}</div>
        <p className="growthFootnote">Cafe24·쿠팡은 주문 실매출, 네이버는 상품에 연결된 광고 전환매출입니다. 상품 연결이 없으면 0원으로 단정하지 않고 연결 대기로 안내합니다.</p>
      </section>
    </>}
  </article>;
}
