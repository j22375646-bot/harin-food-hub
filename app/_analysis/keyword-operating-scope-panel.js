'use client';

import { useEffect, useMemo, useState } from 'react';
import { HarinIcon } from '../_design-system/harin-icon.js';

const won=value=>value==null?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}원`;
const count=value=>value==null?'확인 필요':`${Math.round(Number(value)).toLocaleString('ko-KR')}회`;
const percent=value=>value==null?'확인 필요':`${Number(value).toFixed(0)}%`;

function ScopeMetric({label,value}){
  return <span><small>{label}</small><b>{value}</b></span>;
}

function ScopeState({title,children,tone='neutral',onRetry}){
  return <div className={`keywordOperatingState ${tone}`} role={tone==='danger'?'alert':'status'}>
    <i aria-hidden="true"><HarinIcon name={tone==='danger'?'warning':'analysis'} size={22}/></i>
    <span><b>{title}</b><small>{children}</small></span>
    {onRetry?<button type="button" onClick={onRetry}>다시 확인</button>:null}
  </div>;
}

export default function KeywordOperatingScopePanel({campaignId='ALL',campaignName='',adgroupId='ALL',adgroupName=''}){
  const [requestKey,setRequestKey]=useState(0);
  const [state,setState]=useState({status:'LOADING',analysis:null,error:''});
  const [focus,setFocus]=useState('DEVICE');
  const params=useMemo(()=>{
    const result=new URLSearchParams();
    if(adgroupId!=='ALL')result.set('adgroupId',adgroupId);
    else if(campaignId!=='ALL')result.set('campaignId',campaignId);
    return result;
  },[campaignId,adgroupId]);
  const scopeLabel=adgroupId!=='ALL'?(adgroupName||adgroupId):(campaignName||campaignId);

  useEffect(()=>{
    const controller=new AbortController();
    setState({status:'LOADING',analysis:null,error:''});
    fetch(`/api/naver/bid-operating-scope?${params.toString()}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'지역·기기 성과를 불러오지 못했습니다.');return result.analysis;})
      .then(analysis=>setState({status:'READY',analysis,error:''}))
      .catch(error=>{if(error.name!=='AbortError')setState({status:'FAILED',analysis:null,error:error.message});});
    return ()=>controller.abort();
  },[params,requestKey]);

  const analysis=state.analysis;
  return <section className="keywordOperatingScope" aria-labelledby="keyword-operating-scope-title">
    <header>
      <div className="keywordOperatingHeading">
        <i aria-hidden="true"><HarinIcon name="target" size={23}/></i>
        <span><small>NAVER OPERATING SCOPE</small><h3 id="keyword-operating-scope-title">지역·기기별 운영 범위</h3><p>{scopeLabel} · 최근 7일 실제 집계</p></span>
      </div>
      <div className="keywordOperatingSwitch" aria-label="운영 범위 보기">
        <button type="button" className={focus==='DEVICE'?'active':''} onClick={()=>setFocus('DEVICE')}><HarinIcon name="mobile" size={18}/>PC·모바일</button>
        <button type="button" className={focus==='REGION'?'active':''} onClick={()=>setFocus('REGION')}><HarinIcon name="store" size={18}/>지역 성과</button>
      </div>
    </header>

    {state.status==='LOADING'?<div className="keywordOperatingSkeleton" aria-label="지역·기기 성과 불러오는 중"><i/><i/><i/></div>:null}
    {state.status==='FAILED'?<ScopeState title="운영 범위를 확인하지 못했어요" tone="danger" onRetry={()=>setRequestKey(value=>value+1)}>{state.error}</ScopeState>:null}
    {state.status==='READY'&&focus==='DEVICE'?
      analysis?.device_status==='READY'?<div className="keywordDeviceScope">
        {(analysis.devices||[]).map(item=><article className={`keywordDeviceCard ${item.key.toLowerCase()}`} key={item.key}>
          <div><i aria-hidden="true"><HarinIcon name={item.key==='MOBILE'?'mobile':'analysis'} size={24}/></i><span><small>{item.key==='MOBILE'?'MOBILE':'DESKTOP'}</small><b>{item.label}</b></span></div>
          <dl>
            <ScopeMetric label="노출" value={count(item.impressions)}/><ScopeMetric label="클릭" value={count(item.clicks)}/>
            <ScopeMetric label="광고비" value={won(item.cost)}/><ScopeMetric label="ROAS" value={percent(item.roas)}/>
          </dl>
          <p>실제 이익 <strong>{item.actual_profit==null?'판단 보류':won(item.actual_profit)}</strong></p>
        </article>)}
      </div>:<ScopeState title="PC·모바일 자료가 아직 없어요">네이버 실제 집계가 쌓인 뒤 다시 확인해주세요.</ScopeState>
    :null}
    {state.status==='READY'&&focus==='REGION'?
      analysis?.region_status==='READY'?<div className="keywordRegionScope">
        {(analysis.regions||[]).slice(0,12).map((item,index)=><article key={item.key} style={{'--region-rank':index}}>
          <div><i aria-hidden="true">{String(index+1).padStart(2,'0')}</i><span><b>{item.label}</b><small>실제 지역 집계</small></span></div>
          <dl><ScopeMetric label="광고비" value={won(item.cost)}/><ScopeMetric label="클릭" value={count(item.clicks)}/><ScopeMetric label="ROAS" value={percent(item.roas)}/></dl>
        </article>)}
      </div>:<ScopeState title="지역 성과는 확인 필요예요">지원되지 않는 범위를 전국으로 가정하지 않습니다. 네이버 계정의 실제 지역 집계 지원 여부를 확인해주세요.</ScopeState>
    :null}

    {state.status==='READY'?<footer>
      <HarinIcon name="warning" size={18}/><p><b>입찰가 적용 범위</b>{analysis?.notice||'기기·지역 성과는 비교 자료이며 변경 입찰가는 공통 입찰가로 적용됩니다.'}</p>
      {analysis?.period?.since?<small>{analysis.period.since} ~ {analysis.period.until}</small>:null}
    </footer>:null}
  </section>;
}
