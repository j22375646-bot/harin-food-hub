(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MoaonMarketingSummary=api;})(typeof globalThis==='object'?globalThis:this,()=>{
 const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 function summarize(w){return ['revenue','cost','cvr'].map(key=>{
  const label={revenue:'전환매출',cost:'광고비',cvr:'전환율'}[key],current=w?.metrics?.[key],previous=w?.previous?.[key];
  const comparable=w?.status==='OBSERVED'&&w.days>0&&w.coveredDays===w.days&&w.previousCoveredDays===w.days&&valid(current)&&valid(previous);
  const base={key,label,current:valid(current)?current:null,previous:valid(previous)?previous:null};
  if(!comparable)return {...base,direction:'unknown',title:label+' 비교 자료 확인 필요',change:'두 기간의 관측일과 원천 지표를 확인해야 합니다.',action:'누락된 자료를 확인한 뒤 비교하세요.',enabled:false};
  if(key!=='cvr'&&previous===0)return {...base,direction:'unknown',title:label+' · 직전 기간 0',change:'이전 값이 0이므로 증감률을 계산하지 않습니다.',action:'집행 시작 여부와 수집 범위를 확인하세요.',enabled:false};
  const delta=key==='cvr'?current-previous:(current-previous)/previous*100,direction=delta>0?'up':delta<0?'down':'flat';
  const change=key==='cvr'?`직전 대비 ${delta>0?'+':''}${delta.toFixed(2)}%p`:`직전 대비 ${delta>0?'+':''}${delta.toFixed(1)}%`;
  return {...base,direction,title:label+(key==='cost'?'가':'이')+(direction==='up'?' 증가했어요.':direction==='down'?' 감소했어요.':' 같은 수준이에요.'),change:change+' · 관측된 네이버 광고 자료 기준',action:key==='revenue'?'캠페인·키워드별 전환 기여를 확인하세요.':key==='cost'?'노출·클릭·전환 변화도 함께 비교하세요.':'전환수와 클릭 표본을 함께 확인하세요.',enabled:true};
 });}
 return {summarize};
});
