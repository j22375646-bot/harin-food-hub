'use client';

import { useState } from 'react';

const money = value => value == null ? '판단 보류' : `${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
const percent = value => value == null ? '판단 보류' : `${Number(value).toFixed(1)}%`;

export default function ProductAdTargetsCenter({ center = {} }) {
  const [rows,setRows] = useState(() => Object.fromEntries((center.items||[]).map(item=>[item.master_product_id,item.target_profit_margin_rate ?? ''])));
  const [saving,setSaving] = useState('');
  const [message,setMessage] = useState('');
  const items = center.items||[];
  async function save(item) {
    setSaving(item.master_product_id); setMessage('상품 목표를 저장하는 중입니다…');
    try {
      const response=await fetch('/api/product-ad-targets',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({master_product_id:item.master_product_id,target_profit_margin_rate:rows[item.master_product_id]})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'저장 실패');
      setMessage('저장 완료 · 새 목표로 서버 계산을 다시 불러옵니다.');
      window.location.reload();
    } catch(error) { setMessage(`확인 필요 · ${error.message}`); setSaving(''); }
  }
  return <section className="productAdTargetsCenter">
    <article className="productAdTargetsHero">
      <div><span>상품별 광고 안전선</span><h2>상품별 광고 목표 계산센터</h2><p>ROAS 700%를 모든 상품에 똑같이 적용하지 않고, 상품마다 실제로 돈이 남는 광고 한도를 계산합니다.</p></div>
      <aside><small>계산 가능</small><strong>{center.summary?.ready_products||0}개</strong><em>{center.period_start||'-'} ~ {center.period_end||'-'}</em></aside>
    </article>
    <details className="productAdTargetsHelp"><summary>이 숫자는 어떻게 계산하나요?</summary><div><p><b>계산 순서</b><br/>실제 매출에서 원가·수수료·배송비를 빼고, 사장님이 남기고 싶은 목표 이익률을 반영해 손익분기 ROAS → 목표 ROAS → 허용 CPA → 허용 CPC 순서로 계산합니다.</p><p><b>쉬운 예</b><br/>광고 전 주문당 10,000원이 남고 목표 이익이 4,000원이면 광고비는 주문당 최대 6,000원까지 쓸 수 있습니다. 전환율이 5%라면 허용 CPC는 300원입니다.</p><p><b>안전장치</b><br/>원가·정산·광고비 연결이 부족하거나 데이터가 오래되면 0원으로 계산하지 않고 ‘판단 보류’로 표시합니다.</p></div></details>
    <div className="productAdTargetsSummary"><span><small>목표 입력</small><b>{center.summary?.configured_products||0}/{center.summary?.total_products||0}</b></span><span><small>더 지켜보기</small><b>{center.summary?.observe_products||0}개</b></span><span><small>판단 보류</small><b>{center.summary?.blocked_products||0}개</b></span><span><small>공식 버전</small><b>{center.formula_version||'-'}</b></span></div>
    {message&&<div className="syncToast">{message}</div>}
    <div className="productAdTargetsList">{items.length?items.slice(0,20).map(item=><article className={`productAdTargetRow ${String(item.status||'blocked').toLowerCase()}`} key={item.master_product_id}>
      <header><div><span>{item.status==='READY'?'계산 가능':item.status==='OBSERVE'?'더 지켜보기':'판단 보류'}</span><h3>{item.name}</h3><p>{item.decision_label}</p></div><label>목표 이익률 %<input type="number" min="0" max="99.99" step="0.1" value={rows[item.master_product_id]} onChange={event=>setRows(current=>({...current,[item.master_product_id]:event.target.value}))}/><button disabled={saving===item.master_product_id} onClick={()=>save(item)}>{saving===item.master_product_id?'저장 중':'저장'}</button></label></header>
      <div className="productAdTargetMetrics"><span><small>광고 전 이익률</small><b>{percent(item.contribution_margin_rate)}</b></span><span><small>손익분기 ROAS</small><b>{percent(item.break_even_roas)}</b></span><span><small>목표 ROAS</small><b>{percent(item.target_roas)}</b></span><span><small>허용 CPA</small><b>{money(item.allowable_cpa)}</b></span><span><small>허용 CPC</small><b>{money(item.allowable_cpc)}</b></span><span><small>현재 CPC</small><b>{money(item.current_cpc)}</b></span></div>
      <footer><span>네이버 표본 · 클릭 {Math.round(item.naver_clicks||0).toLocaleString('ko-KR')}회 / 전환 {Math.round(item.naver_conversions||0).toLocaleString('ko-KR')}건</span><span>정산 ROAS · {item.settlement_roas_status==='READY'?'확인됨':'확인 필요'}</span></footer>
      {item.reasons?.length?<ul>{item.reasons.map(reason=><li key={reason.code}>{reason.message}</li>)}</ul>:null}
    </article>):<div className="productAdTargetsEmpty">상품 매핑과 최근 실적이 준비되면 상품별 목표가 표시됩니다.</div>}</div>
  </section>;
}
