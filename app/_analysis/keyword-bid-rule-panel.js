'use client';

import './keyword-bid-rule-panel.css';
import { useMemo, useState } from 'react';
import bidRulesModule from '../../lib/naver/bid-rules.js';
import { HarinIcon } from '../_design-system/harin-icon.js';

const {simulateNaverBidRule}=bidRulesModule;

const rawKeywordId=row=>String(row?.id||'').replace(/^NAVER:/,'');
const won=value=>Number.isFinite(Number(value))?`${Math.round(Number(value)).toLocaleString('ko-KR')}원`:'확인 필요';

function initialDraft(rows,rules){
  const first=rows.map(row=>rules.find(rule=>rule.ncc_keyword_id===rawKeywordId(row))).find(Boolean);
  return {
    enabled:first?.enabled===true,
    target_rank:first?.target_rank??3,
    minimum_bid:first?.minimum_bid??70,
    maximum_bid:first?.maximum_bid??100000,
    increase_step:first?.increase_step??10,
    decrease_step:first?.decrease_step??10
  };
}

export default function KeywordBidRulePanel({selectedRows=[],savedRules=[],onRulesChange,onApplyDrafts}){
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState(()=>initialDraft(selectedRows,savedRules));
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');
  const configured=useMemo(()=>new Set(savedRules.map(item=>item.ncc_keyword_id)),[savedRules]);
  const configuredSelected=selectedRows.filter(row=>configured.has(rawKeywordId(row))).length;
  const previews=useMemo(()=>selectedRows.map(row=>{
    try{
      const rule={...draft,ncc_keyword_id:rawKeywordId(row),ncc_adgroup_id:row.adgroupId};
      return {row,lower:simulateNaverBidRule({row,rule,action:'DECREASE'}),upper:simulateNaverBidRule({row,rule,action:'INCREASE'})};
    }catch(error){return {row,error:error.message};}
  }),[selectedRows,draft]);

  function update(field,value){
    setNotice('');
    setDraft(current=>({...current,[field]:value}));
  }

  function openPanel(){
    if(!selectedRows.length)return;
    setDraft(initialDraft(selectedRows,savedRules));
    setNotice('');
    setOpen(true);
  }

  async function save(){
    if(saving||!selectedRows.length)return;
    setSaving(true);setNotice('선택한 네이버 키워드에 안전설정을 저장하고 있어요.');
    try{
      const payload={platform:'NAVER',rules:selectedRows.map(row=>({
        ...draft,
        ncc_keyword_id:rawKeywordId(row),
        ncc_adgroup_id:row.adgroupId
      }))};
      const response=await fetch('/api/naver/bid-rules',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||'안전설정을 저장하지 못했습니다.');
      const savedById=new Map((result.rules||[]).map(item=>[item.ncc_keyword_id,item]));
      onRulesChange?.([...savedRules.filter(item=>!savedById.has(item.ncc_keyword_id)),...(result.rules||[])]);
      setNotice(`${result.saved_count||0}개 키워드의 안전설정을 저장했어요. 광고 입찰가는 아직 바뀌지 않았습니다.`);
    }catch(error){setNotice(error.message||'안전설정을 저장하지 못했습니다.');}
    finally{setSaving(false);}
  }

  function apply(action){
    const key=action==='INCREASE'?'upper':'lower';
    const applicable=previews.filter(item=>!item.error&&item.row.canDraft).map(item=>({row:item.row,preview:item[key]}));
    onApplyDrafts?.(applicable);
    setNotice(`${applicable.length}개 변경칸에 ${action==='INCREASE'?'인상':'인하'} 폭을 미리 채웠어요. 저장이나 네이버 반영은 아직 하지 않았습니다.`);
  }

  return <>
    <button type="button" onClick={openPanel} disabled={!selectedRows.length} className="bidRuleTrigger">
      <HarinIcon name="shield" size={16}/>안전설정 {configuredSelected}/{selectedRows.length}
    </button>
    {open?<div className="bidRuleBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!saving)setOpen(false);}}>
      <section className="bidRulePanel" role="dialog" aria-modal="true" aria-labelledby="bid-rule-title">
        <header>
          <span><small>24-3 · NAVER BID SAFETY</small><h2 id="bid-rule-title">선택 키워드의 입찰 안전선을 정해요</h2><p>선택 {selectedRows.length}개에 같은 기준을 저장합니다. 쿠팡 키워드는 이 설정과 API에 들어오지 않습니다.</p></span>
          <button type="button" onClick={()=>setOpen(false)} disabled={saving} aria-label="입찰 안전설정 닫기">×</button>
        </header>
        <div className="bidRuleScope">
          <i><HarinIcon name="shield" size={21}/></i><span><b>설정 저장과 실제 입찰 변경은 별개예요</b><small>여기서는 기준만 저장합니다. 실제 변경은 기존 `변경 전 확인`에서 현재값 재조회 후 진행됩니다.</small></span><em>네이버 전용</em>
        </div>
        <div className="bidRuleFields">
          <label><span>참고 목표 순위</span><select value={draft.target_rank??''} onChange={event=>update('target_rank',event.target.value===''?null:Number(event.target.value))}><option value="">정하지 않음</option>{[1,2,3,4,5].map(value=><option value={value} key={value}>{value}위</option>)}</select><small>공식 예상 조회가 확인된 1~5위만</small></label>
          <label><span>최저 입찰가</span><input type="number" inputMode="numeric" min="70" max="100000" step="10" value={draft.minimum_bid} onChange={event=>update('minimum_bid',Number(event.target.value))}/><small>이 값 아래로 미리 채우지 않아요</small></label>
          <label><span>최고 입찰가</span><input type="number" inputMode="numeric" min="70" max="100000" step="10" value={draft.maximum_bid} onChange={event=>update('maximum_bid',Number(event.target.value))}/><small>서버 안전폭보다 넓게 열리지 않아요</small></label>
          <label><span>한 번 인상 폭</span><input type="number" inputMode="numeric" min="10" max="100000" step="10" value={draft.increase_step} onChange={event=>update('increase_step',Number(event.target.value))}/><small>선택 키워드 변경칸 미리보기용</small></label>
          <label><span>한 번 인하 폭</span><input type="number" inputMode="numeric" min="10" max="100000" step="10" value={draft.decrease_step} onChange={event=>update('decrease_step',Number(event.target.value))}/><small>선택 키워드 변경칸 미리보기용</small></label>
        </div>
        <label className="bidRuleEnable"><input type="checkbox" checked={draft.enabled===true} onChange={event=>update('enabled',event.target.checked)}/><span><b>이 안전설정을 활성 기준으로 저장</b><small>활성화해도 자동으로 입찰을 바꾸지 않습니다. 다음 자동운영 단계에서 참고할 준비값입니다.</small></span></label>
        <div className="bidRulePreview">
          <header><span><b>변경칸 미리보기</b><small>저장 기준과 현재 서버 허용 범위 중 더 좁은 값으로 계산합니다.</small></span><em>{previews.filter(item=>!item.error).length}/{previews.length}개 계산</em></header>
          <div>{previews.slice(0,6).map(item=><span key={item.row.id}><b>{item.row.keyword}</b>{item.error?<small>{item.error}</small>:<small>{won(item.row.currentBid)} · 인하 {won(item.lower.proposed_bid)} / 인상 {won(item.upper.proposed_bid)}</small>}</span>)}</div>
          {previews.length>6?<p>외 {previews.length-6}개 키워드에도 같은 안전 기준을 적용합니다.</p>:null}
        </div>
        <aside><HarinIcon name="target" size={18}/><span><b>목표 순위는 참고값이에요.</b><small>PC·모바일 공식 예상 조회 기준으로만 보존하며, 순간 실제 순위나 자동 입찰 근거로 표시하지 않습니다.</small></span></aside>
        {notice?<p className="bidRuleNotice" role="status">{notice}</p>:null}
        <footer>
          <button type="button" className="secondary" onClick={()=>apply('DECREASE')} disabled={saving||!previews.some(item=>!item.error&&item.row.canDraft)}>인하 폭 미리 채우기</button>
          <button type="button" className="secondary" onClick={()=>apply('INCREASE')} disabled={saving||!previews.some(item=>!item.error&&item.row.canDraft)}>인상 폭 미리 채우기</button>
          <button type="button" className="primary" onClick={save} disabled={saving||!selectedRows.length}>{saving?'저장 중…':`${selectedRows.length}개 안전설정 저장`}</button>
        </footer>
      </section>
    </div>:null}
  </>;
}
