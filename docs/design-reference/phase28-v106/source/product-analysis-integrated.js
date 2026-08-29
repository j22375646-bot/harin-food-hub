(() => {
  const root = document.getElementById('productAnalysisPage');
  if (!root) return;

  const AS_OF = '2026.08.28 10:42';
  const products = {
    'jack-bean':{
      name:'작두콩수세미차 30티백',short:'작두콩수세미차',glyph:'작',option:'923001',keyword:'작두콩차',packSize:30,
      demandValue:15330,demandPc:2410,demandMobile:12920,marketCount:'1,000+개',female:67,
      audienceSegments:{male:[2,7,9,13,2],female:[6,12,18,25,6]},
      profitValue:246800,profitRate:32.4,ordersValue:28,unitsValue:62,revenueValue:762000,sessionValue:null,priceValue:12000,
      priceSamples:[7900,8200,8500,8900,9200,9500,9900,10500,10900,11300,11800,11900,12200,12500,12900,13900,14500,15200,16900,18900],
      trendSummary:'초여름 이후 완만한 상승',trend:[39,44,42,48,53,59,63,68,72,78,83,88],
      channels:[['네이버',58,442000],['Cafe24',24,182000],['쿠팡',18,138000]],
      keywords:[['작두콩차',15330,'중간','대표'],['목에좋은차',6820,'낮음','기회'],['작두콩차 티백',2540,'낮음','기회']],
      competitors:[{name:'국내산 작두콩차 50티백',price:13900,pack:50},{name:'볶은 작두콩차 40티백',price:11800,pack:40},{name:'작두콩 수세미 블렌드',price:15500,pack:30}],
      next:'모바일 검색 수요가 높아 네이버 대표키워드와 상품명 연결을 먼저 확인해요.'
    },
    'red-beet':{
      name:'레드비트차 45g',short:'레드비트차',glyph:'레',option:'923002',keyword:'레드비트차',packSize:45,
      demandValue:8420,demandPc:1130,demandMobile:7290,marketCount:'620+개',female:61,
      audienceSegments:{male:[5,9,12,10,3],female:[7,15,22,12,5]},
      profitValue:118400,profitRate:27.1,ordersValue:19,unitsValue:54,revenueValue:437000,sessionValue:null,priceValue:9800,
      priceSamples:[6900,7200,7600,7900,8200,8500,8800,8900,9200,9500,9900,10200,10500,10900,11300,11900,12600,13200,14500,15900],
      trendSummary:'봄 이후 검색 관심이 다시 커짐',trend:[32,35,38,40,43,47,54,61,66,71,76,81],
      channels:[['네이버',49,214000],['Cafe24',30,131000],['쿠팡',21,92000]],
      keywords:[['레드비트차',8420,'중간','대표'],['비트차',5260,'높음','관찰'],['레드비트 티백',1890,'낮음','기회']],
      competitors:[{name:'국산 레드비트차 40티백',price:10900,pack:40},{name:'건조 비트차 100g',price:8900,pack:100},{name:'레드비트 블렌딩차',price:12600,pack:30}],
      next:'검색 관심 회복이 실제 판매로 이어지는지 상위 10% 시나리오와 가격 위치를 함께 확인해요.'
    },
    barley:{
      name:'보리차 50티백',short:'보리차',glyph:'보',option:'923003',keyword:'보리차',packSize:50,
      demandValue:27800,demandPc:3920,demandMobile:23880,marketCount:'2,400+개',female:53,
      audienceSegments:{male:[4,9,13,14,7],female:[5,9,14,17,8]},
      profitValue:322600,profitRate:35.8,ordersValue:41,unitsValue:70,revenueValue:901000,sessionValue:1250,priceValue:8900,
      priceSamples:[6200,6500,6900,7200,7500,7900,8200,8500,8700,8900,9200,9500,9900,10500,10900,11500,11900,12800,13800,14900],
      trendSummary:'여름 수요가 높고 최근 안정 구간',trend:[46,48,52,61,74,92,100,95,88,77,66,58],
      channels:[['네이버',46,414000],['Cafe24',34,306000],['쿠팡',20,181000]],
      keywords:[['보리차',27800,'높음','대표'],['보리차 티백',12400,'높음','관찰'],['무카페인 차',4120,'중간','기회']],
      competitors:[{name:'국산 보리차 100티백',price:11900,pack:100},{name:'유기농 보리차 50티백',price:9500,pack:50},{name:'냉침 보리차 대용량',price:13800,pack:60}],
      next:'검색 수요는 충분하므로 경쟁이 높은 대표키워드보다 티백·냉침 세부어의 전환을 확인해요.'
    },
    burdock:{
      name:'우엉차 40티백',short:'우엉차',glyph:'우',option:'923004',keyword:'우엉차',packSize:40,
      demandValue:12600,demandPc:2010,demandMobile:10590,marketCount:'890+개',female:72,
      audienceSegments:{male:[2,4,8,9,5],female:[5,12,21,27,7]},
      profitValue:null,profitRate:null,ordersValue:17,unitsValue:38,revenueValue:452000,sessionValue:null,priceValue:11900,
      priceSamples:[7600,8100,8500,8900,9200,9600,9900,10400,10800,11200,11600,11900,12300,12900,13500,14200,14900,15800,16500,17900],
      trendSummary:'연초 강세 뒤 현재는 완만한 회복',trend:[94,100,88,72,61,55,51,54,58,63,69,74],
      channels:[['네이버',52,235000],['Cafe24',31,140000],['쿠팡',17,77000]],
      keywords:[['우엉차',12600,'중간','대표'],['볶은 우엉차',4880,'낮음','기회'],['우엉차 티백',3420,'낮음','기회']],
      competitors:[{name:'국내산 볶은 우엉차',price:12900,pack:40},{name:'우엉차 100티백',price:16500,pack:100},{name:'무첨가 우엉차 티백',price:10800,pack:30}],
      next:'공헌이익을 판단할 포장 원가가 없어 키워드 확대보다 원가 근거를 먼저 연결해요.'
    }
  };

  const normalizedData = window.ProductAnalysisDataV93 || window.ProductAnalysisDataV92 || window.ProductAnalysisDataV91;
  Object.entries(products).forEach(([key,item]) => {
    item.v91 = normalizedData?.products?.[key] || null;
  });

  const storyMeta = {
    'jack-bean':{verdict:'검색 수요는 강하지만, 판매 연결 근거는 더 확인해야 해요.',copy:'모바일 중심의 검색 관심은 충분합니다. 대표키워드와 상품 연결을 먼저 확인하면 다음 판단이 선명해져요.',tags:[['수요 강함','strong'],['가격 중간',''],['판매 연결 확인','hold']],radar:[84,72,61,68,58,78]},
    'red-beet':{verdict:'관심은 회복 중이지만, 판매 연결을 먼저 검증해야 해요.',copy:'봄 이후 검색 관심이 커지고 있습니다. 시장 표본 위치와 가격 경쟁력을 보고 상위권 진입 가정을 검증해요.',tags:[['수요 회복','strong'],['가격 낮음',''],['판매 연결 확인','hold']],radar:[66,75,54,74,52,78]},
    barley:{verdict:'보리차는 수요가 크지만 경쟁도 높아, 세부 검색어가 중요해요.',copy:'여름 수요와 자사 판매는 충분합니다. 대표어보다 티백·냉침 같은 구체적인 검색 의도를 먼저 확인해요.',tags:[['수요 매우 강함','strong'],['경쟁 높음','hold'],['판매 연결 양호','']],radar:[94,81,42,77,76,89]},
    burdock:{verdict:'검색 수요는 유지되지만, 원가 근거가 없어 수익 판단은 보류해요.',copy:'검색 관심과 판매는 확인됐습니다. 포장 원가가 연결되기 전에는 키워드 확대나 할인 판단을 하지 않아요.',tags:[['수요 유지','strong'],['가격 중간',''],['수익 판단 보류','hold']],radar:[73,58,62,61,49,67]}
  };

  const periodMeta = {30:{label:'최근 30일',short:'30일',aside:'30일 · 30일 실적',scale:.9},90:{label:'최근 90일',short:'90일',aside:'90일 · 30일 실적',scale:1},365:{label:'최근 1년',short:'1년',aside:'1년 · 30일 실적',scale:1.08}};
  const statusLabel = {READY:'연결',CALCULATED:'계산',SAMPLE:'표본',SETUP_REQUIRED:'확인 필요',CONFIRM_REQUIRED:'확인 필요'};
  const kindLabel = {actual:'실제',relative:'상대지수',sample:'표본',calculated:'계산'};
  let selectedKey = 'jack-bean';
  let period = 90;
  let activeSnapshot = null;

  const formatNumber = value => Number(value).toLocaleString('ko-KR');
  const formatWon = value => value == null ? '확인 필요' : `${formatNumber(Math.round(value))}원`;
  const formatRevenue = value => `₩${formatNumber(value)}`;
  const text = (id,value) => { const element=document.getElementById(id); if (element) element.textContent=value; };
  const quantile = (sorted,q) => { const position=(sorted.length-1)*q,base=Math.floor(position),rest=position-base; return sorted[base+1] === undefined ? sorted[base] : sorted[base]+rest*(sorted[base+1]-sorted[base]); };
  const animate = () => {
    const card=root.querySelector('.product-analysis-product-card'),workbench=root.querySelector('.product-analysis-workbench'),aside=root.querySelector('.product-analysis-aside');
    [card,workbench,aside].forEach(element=>{ element?.classList.remove('is-changing','is-updating'); void element?.offsetWidth; });
    card?.classList.add('is-changing');workbench?.classList.add('is-updating');aside?.classList.add('is-updating');
    setTimeout(()=>{card?.classList.remove('is-changing');workbench?.classList.remove('is-updating');aside?.classList.remove('is-updating');},420);
  };

  const getEvidence = item => {
    const sortedPrices=[...item.priceSamples].sort((a,b)=>a-b);
    return [
      {id:'search-volume',label:'검색량',value:item.demandValue,unit:'회',source:'Naver Search Ads',kind:'actual',status:'READY',period:'월간 최신값',asOf:AS_OF,sampleSize:null},
      {id:'search-trend',label:'검색추세',value:trendValues(item).at(-1),unit:'상대지수',source:'Naver DataLab',kind:'relative',status:'READY',period:periodMeta[period].short,asOf:AS_OF,sampleSize:null},
      {id:'audience',label:'고객층',value:item.female,unit:'%',source:'Naver DataLab',kind:'relative',status:'READY',period:periodMeta[period].short,asOf:AS_OF,sampleSize:null},
      {id:'market',label:'경쟁상품',value:item.marketCount,unit:'건',source:'Naver Shopping Search',kind:'sample',status:'SAMPLE',period:'현재 표본',asOf:AS_OF,sampleSize:null},
      {id:'price',label:'가격표본',value:quantile(sortedPrices,.5),unit:'원',source:'Naver Shopping Search',kind:'sample',status:'SAMPLE',period:'현재 표본',asOf:AS_OF,sampleSize:item.priceSamples.length},
      {id:'orders',label:'주문·매출',value:item.ordersValue,unit:'건',source:'Harin Orders',kind:'actual',status:'READY',period:periodMeta[period].short,asOf:AS_OF,sampleSize:null},
      {id:'cost',label:'원가',value:item.profitValue,unit:'원',source:'Harin Cost Ledger',kind:'calculated',status:item.profitValue == null?'CONFIRM_REQUIRED':'CALCULATED',period:'현재',asOf:AS_OF,sampleSize:null},
      {id:'sessions',label:'상품유입',value:item.sessionValue,unit:'회',source:'Channel Analytics',kind:'actual',status:item.sessionValue == null?'SETUP_REQUIRED':'READY',period:periodMeta[period].short,asOf:AS_OF,sampleSize:null},
      {id:'reviews',label:'리뷰근거',value:null,unit:'건',source:'Verified Evidence',kind:'sample',status:'CONFIRM_REQUIRED',period:'미연결',asOf:AS_OF,sampleSize:null}
    ];
  };
  const availableEvidence = evidence => evidence.filter(entry=>['READY','CALCULATED','SAMPLE'].includes(entry.status));

  const polygonPoints = (values,radius=104,cx=180,cy=142) => values.map((value,index)=>{ const angle=-Math.PI/2+index*Math.PI/3,scaled=radius*value/100; return `${(cx+Math.cos(angle)*scaled).toFixed(1)},${(cy+Math.sin(angle)*scaled).toFixed(1)}`; }).join(' ');
  const renderRadar = () => {
    const labels=['검색 수요','성장 속도','고객 집중','가격 경쟁력','판매 연결','근거 신뢰'],market=[62,58,68,61,55,72],product=storyMeta[selectedKey].radar;
    const grids=[25,50,75,100].map(level=>`<polygon class="radar-grid" points="${polygonPoints(Array(6).fill(level))}"></polygon>`).join('');
    const axes=labels.map((label,index)=>{ const angle=-Math.PI/2+index*Math.PI/3,x2=180+Math.cos(angle)*104,y2=142+Math.sin(angle)*104,x=180+Math.cos(angle)*126,y=142+Math.sin(angle)*126+4,anchor=Math.abs(x-180)<8?'middle':x>180?'start':'end'; return `<line class="radar-axis" x1="180" y1="142" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"></line><text data-radar-axis x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}">${label}</text>`; }).join('');
    const points=product.map((value,index)=>{const angle=-Math.PI/2+index*Math.PI/3,scaled=104*value/100;return `<circle class="radar-product-point" cx="${(180+Math.cos(angle)*scaled).toFixed(1)}" cy="${(142+Math.sin(angle)*scaled).toFixed(1)}" r="4"></circle>`;}).join('');
    document.getElementById('productAnalysisRadar').innerHTML=`<svg viewBox="0 0 360 300" role="img" aria-labelledby="productAnalysisRadarTitle"><title id="productAnalysisRadarTitle">내 상품과 시장 중간값의 여섯 가지 근거 비교</title>${grids}${axes}<polygon class="radar-market" data-radar-series="market" points="${polygonPoints(market)}"></polygon><polygon class="radar-product" data-radar-series="product" points="${polygonPoints(product)}"></polygon>${points}</svg>`;
  };

  const trendValues = item => (period===30?item.trend.slice(-6):item.trend).map(point=>Math.min(100,Math.round(point*periodMeta[period].scale)));
  const renderTrend = item => {
    const values=trendValues(item),width=760,height=270,padX=42,top=22,bottom=42,chartHeight=height-top-bottom,step=(width-padX*2)/(values.length-1);
    const points=values.map((value,index)=>({x:padX+step*index,y:top+chartHeight*(1-value/100),value,label:period===365?`${index+1}월`:`${index+1}주`}));
    const line=points.map((point,index)=>`${index?'L':'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),area=`${line} L${points.at(-1).x.toFixed(1)},${height-bottom} L${points[0].x.toFixed(1)},${height-bottom} Z`;
    const grids=[25,50,75,100].map(value=>{const y=top+chartHeight*(1-value/100);return `<line class="trend-grid" x1="${padX}" y1="${y}" x2="${width-padX}" y2="${y}"></line><text x="8" y="${y+4}" fill="currentColor" opacity=".55" font-size="10">${value}</text>`;}).join('');
    const marks=points.map(point=>`<g data-trend-point tabindex="0" aria-label="${point.label} 상대지수 ${point.value}"><circle cx="${point.x}" cy="${point.y}" r="4"></circle><text x="${point.x}" y="${height-13}" text-anchor="middle">${point.label}</text><text class="trend-value" x="${point.x}" y="${Math.max(15,point.y-11)}" text-anchor="middle">${point.value}</text></g>`).join('');
    document.getElementById('productAnalysisTrendChart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${item.keyword} 검색 상대지수 추세">${grids}<path class="trend-area" d="${area}"></path><path class="trend-line" d="${line}"></path>${marks}</svg>`;
    const current=values.at(-1),previous=values.at(-2),delta=current-previous,peak=Math.max(...values);
    document.getElementById('productAnalysisTrendStats').innerHTML=`<article><span>현재</span><strong>${current}</strong></article><article><span>최고</span><strong>${peak}</strong></article><article class="${delta>=0?'up':'down'}"><span>직전 대비</span><strong>${delta>=0?'+':''}${delta}</strong></article><article><span>지표 성격</span><strong>상대지수</strong></article>`;
  };

  const renderAudience = item => {
    const male=100-item.female;
    document.getElementById('productAnalysisGenderSplit').innerHTML=`<span class="male" data-gender-share="male" style="--share:${male}"><small>남성</small><strong>${male}%</strong></span><span class="female" data-gender-share="female" style="--share:${item.female}"><small>여성</small><strong>${item.female}%</strong></span>`;
    const labels=['20대','30대','40대','50대','60대+'],max=Math.max(...item.audienceSegments.male,...item.audienceSegments.female);
    document.getElementById('productAnalysisAudienceButterfly').innerHTML=`<header><span>남성</span><span>연령</span><span>여성</span></header>${labels.map((label,index)=>`<article data-age-row><div class="male"><span>${item.audienceSegments.male[index]}%</span><i><b style="--share:${item.audienceSegments.male[index]/max*100}"></b></i></div><strong>${label}</strong><div class="female"><i><b style="--share:${item.audienceSegments.female[index]/max*100}"></b></i><span>${item.audienceSegments.female[index]}%</span></div></article>`).join('')}`;
  };

  const renderPrice = item => {
    const values=[...item.priceSamples].sort((a,b)=>a-b),minimum=Math.floor(values[0]/1000)*1000,maximum=Math.ceil(values.at(-1)/1000)*1000,binCount=6,binSize=(maximum-minimum)/binCount,bins=Array(binCount).fill(0);
    values.forEach(value=>{const index=Math.min(binCount-1,Math.floor((value-minimum)/binSize));bins[index]+=1;});
    const width=520,height=230,base=190,barWidth=58,gap=22,start=22,maxBin=Math.max(...bins);
    const bars=bins.map((count,index)=>{const x=start+index*(barWidth+gap),h=Math.max(12,count/maxBin*145),y=base-h,label=minimum+binSize*index;return `<rect class="price-histogram ${count===maxBin?'peak':''}" x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="8"></rect><text class="price-count" x="${x+barWidth/2}" y="${y-7}" text-anchor="middle">${count}개</text><text class="price-label" x="${x+barWidth/2}" y="214" text-anchor="middle">${Math.round(label/1000)}천</text>`;}).join('');
    const markerRatio=Math.max(0,Math.min(1,(item.priceValue-minimum)/(maximum-minimum))),markerX=start+markerRatio*((barWidth+gap)*(binCount-1)+barWidth);
    document.getElementById('productAnalysisPriceChart').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="경쟁상품 가격 분포와 우리 판매가 위치"><line class="price-axis" x1="12" y1="${base}" x2="508" y2="${base}"></line>${bars}<line class="price-own-marker" x1="${markerX}" y1="18" x2="${markerX}" y2="${base}"></line><circle class="price-own-dot" cx="${markerX}" cy="18" r="6"></circle><text class="price-own-label" x="${markerX}" y="11" text-anchor="middle">우리 ${formatWon(item.priceValue)}</text></svg>`;
    const q1=quantile(values,.25),median=quantile(values,.5),q3=quantile(values,.75),percentile=Math.round(values.filter(value=>value<=item.priceValue).length/values.length*100);
    text('productAnalysisPriceQ1',formatWon(q1));text('productAnalysisPriceMedian',formatWon(median));text('productAnalysisPriceQ3',formatWon(q3));text('productAnalysisPriceSample',`${values.length}개`);text('productAnalysisPriceSampleLabel',`검색상품 ${values.length}개 표본`);text('productAnalysisPricePosition',`표본 ${percentile}백분위 · 비교 가능한 구성만`);
  };

  const renderSales = item => {
    const match=!activeSnapshot&&period===30,consistency=document.getElementById('productAnalysisPeriodConsistency');
    consistency.className=`analysis-period-consistency ${match?'matched':'mismatch'}`;
    consistency.innerHTML=activeSnapshot?`<strong>자료 성격 분리</strong><span>검색량은 월간 최신값 · 판매는 ${periodMeta[period].short} 실제 집계 · 상품 유입 근거가 있을 때만 전환율 계산</span>`:match?`<strong>기간 일치</strong><span>검색과 판매 모두 30일 기준 · 유입 근거가 있을 때만 전환율 계산</span>`:`<strong>기간 다름</strong><span>검색 ${periodMeta[period].short} · 판매 30일 · 서로 다른 기간의 직접 전환율 비교 금지</span>`;
    const sessionAvailable=Number.isFinite(item.sessionValue),conversion=sessionAvailable?item.ordersValue/item.sessionValue*100:null;
    document.getElementById('productAnalysisSalesBridge').innerHTML=`<article data-sales-bridge-node><small>검색 수요</small><strong>${formatNumber(item.demandValue)}회</strong><em>Naver Search Ads</em></article><i>→</i><article class="${sessionAvailable?'':'unknown'}" data-sales-bridge-node><small>상품 유입</small><strong>${sessionAvailable?`${formatNumber(item.sessionValue)}회`:'확인 필요'}</strong><em>${sessionAvailable?'자사 분석 API':'유입 API 미연결'}</em></article><i>→</i><article data-sales-bridge-node><small>주문</small><strong>${formatNumber(item.ordersValue)}건</strong><em>Harin Orders</em></article><i>→</i><article data-sales-bridge-node><small>판매·매출</small><strong><b>${formatNumber(item.unitsValue)}개</b> · <b>${formatRevenue(item.revenueValue)}</b></strong><em>Harin Orders</em></article><p>${sessionAvailable?`전환율 ${conversion.toFixed(2)}% · 상품 유입 대비 주문`:'상품 유입 근거가 없어 직접 전환율 계산 불가'}</p>`;
    document.getElementById('productAnalysisChannelSales').innerHTML=item.channels.map(([label,share,value])=>`<article><span>${label}</span><i><b style="--share:${share}"></b></i><strong>${formatRevenue(value)}</strong></article>`).join('');
  };

  const renderKeywords = item => {
    const max=Math.max(...item.keywords.map(([,demand])=>demand)),yMap={낮음:29,중간:52,높음:74},colors={대표:'var(--story-blue)',기회:'var(--story-mint)',관찰:'var(--story-apricot)'};
    document.getElementById('productAnalysisKeywords').innerHTML=`<span class="map-label low-competition">경쟁 낮음 ↑</span><span class="map-label high-demand">검색 수요 높음 →</span>${item.keywords.map(([keyword,demand,competition,state])=>{const size=Math.round(76+demand/max*58),x=Math.round(22+demand/max*62);return `<article class="keyword-opportunity-bubble" style="--x:${x}%;--y:${yMap[competition]}%;--size:${size}px;--bubble-color:${colors[state]||'var(--story-lilac)'}"><strong>${keyword}</strong><small>${formatNumber(demand)}회</small></article>`;}).join('')}`;
  };

  const renderCompetitors = item => {
    const points=[...item.competitors,{name:item.name,price:item.priceValue,pack:item.packSize,own:true}],width=640,height=250,left=56,right=24,top=26,bottom=42,prices=points.map(point=>point.price),packs=points.map(point=>point.pack),minPrice=Math.floor(Math.min(...prices)/1000)*1000,maxPrice=Math.ceil(Math.max(...prices)/1000)*1000,minPack=Math.max(0,Math.floor(Math.min(...packs)/10)*10-10),maxPack=Math.ceil(Math.max(...packs)/10)*10;
    const x=value=>left+(value-minPrice)/(maxPrice-minPrice)*(width-left-right),y=value=>top+(maxPack-value)/(maxPack-minPack)*(height-top-bottom),xTicks=Array.from({length:5},(_,index)=>minPrice+(maxPrice-minPrice)*index/4),yTicks=Array.from({length:4},(_,index)=>minPack+(maxPack-minPack)*index/3);
    const grid=`${xTicks.map(value=>`<line class="competition-grid" x1="${x(value)}" y1="${top}" x2="${x(value)}" y2="${height-bottom}"></line><text class="competition-axis-label" x="${x(value)}" y="${height-14}" text-anchor="middle">${Math.round(value/1000)}천</text>`).join('')}${yTicks.map(value=>`<line class="competition-grid" x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"></line><text class="competition-axis-label" x="${left-9}" y="${y(value)+4}" text-anchor="end">${Math.round(value)}</text>`).join('')}`;
    const marks=points.map((point,index)=>`<g data-competitor-point class="${point.own?'own':''}" tabindex="0" aria-label="${point.name} ${formatWon(point.price)} ${point.pack}${selectedKey==='red-beet'?'g':'티백'}"><circle cx="${x(point.price)}" cy="${y(point.pack)}" r="${point.own?10:7}"></circle><text x="${x(point.price)}" y="${y(point.pack)+(index%2?-14:20)}" text-anchor="middle">${point.own?'우리':point.name.split(' ').slice(0,2).join(' ')}</text></g>`).join('');
    document.getElementById('productAnalysisCompetitionMap').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="경쟁상품 가격과 구성량 산점도"><text class="competition-axis-title" x="${left}" y="14">구성량 ↑</text>${grid}${marks}<text class="competition-axis-title" x="${width-right}" y="${height-2}" text-anchor="end">가격 →</text></svg>`;
    const top10=item.v91?.samples?.competitorTop10;
    if (top10) {
      const maxUnits=Math.max(...top10.map(row=>row.estimatedUnits));
      document.getElementById('productAnalysisCompetitors').innerHTML=top10.map(row=>`<article class="competition-rank-row marketer-rank-row" data-competitor-rank="${row.rank}" style="--rank-score:${row.estimatedUnits/maxUnits*100}"><i>${row.rank}</i><span class="competitor-thumb" aria-hidden="true">${row.glyph}</span><span class="competitor-copy"><strong>${row.name}</strong><small>${row.packSize}${row.unitType==='GRAM'?'g':'티백'} · 판매량 추정 ${formatNumber(row.estimatedUnits)}개 · 신뢰 ${row.estimateConfidence}/100</small></span><span class="competition-bar"><b></b></span><span class="competitor-values"><b>${formatWon(row.price)}</b><em>ESTIMATE</em></span></article>`).join('');
    } else {
      const rows=[item.competitors[0],{name:item.name,price:item.priceValue,pack:item.packSize,own:true},item.competitors[1],item.competitors[2]],scores=[96,82,70,58];
      document.getElementById('productAnalysisCompetitors').innerHTML=rows.map((row,index)=>`<article class="competition-rank-row ${row.own?'own':''}" style="--rank-score:${scores[index]}"><i>${row.own?'H':index+1}</i><span><strong>${row.name}</strong><small>${row.own?'자사 판매상품':'검색 API 비교 표본'} · ${row.pack}${selectedKey==='red-beet'?'g':'티백'}</small></span><span class="competition-bar"><b></b></span><b>${formatWon(row.price)}</b></article>`).join('');
    }
  };

  const renderDecisionBrief = item => {
    const data=item.v91,profit=data.metrics.contributionProfit,position=data.metrics.marketPercentile,scenarios=data.samples.growthScenarios,current=scenarios.find(entry=>entry.id==='current'),top10=scenarios.find(entry=>entry.id==='top10'),additional=top10.units-current.units;
    const profitMissing=profit.status==='CONFIRM_REQUIRED'||profit.value==null;
    const signals=[
      {icon:'↗',label:'수요 기회',value:`월 ${formatNumber(data.metrics.searchDemand.value)}회`,copy:`최근 12개월 최고 ${Math.max(...data.series.searchSeasonality.values)} · ${item.trendSummary}`,tone:'opportunity'},
      {icon:'≋',label:'시장 위치',value:`표본 상위 ${position.value}%`,copy:`비교상품 ${formatNumber(position.sampleSize)}개 · 정확한 노출순위 아님`,tone:'price'},
      {icon:'△',label:'성장 시나리오',value:`+${formatNumber(additional)}개 가능`,copy:`상위 10% 진입 가정 · 실제 예측값 아님`,tone:'opportunity'},
      {icon:'!',label:'판단 공백',value:profitMissing?'수익 판단 보류':'리뷰 근거 확인 필요',copy:profitMissing?'포장 원가 확인 필요 · 이익 계산 중지':'검증된 외부 리뷰 API · SETUP_REQUIRED',tone:'missing'}
    ];
    document.getElementById('productAnalysisDecisionSignals').innerHTML=signals.map((signal,index)=>`<article data-decision-signal data-tone="${signal.tone}" style="--signal-delay:${index}"><i aria-hidden="true">${signal.icon}</i><span><small>${signal.label}</small><strong>${signal.value}</strong><em>${signal.copy}</em></span></article>`).join('');
  };

  const renderMarketerSummary = item => {
    const data=item.v91,metrics=data.metrics,summary=[
      ['검색 수요',`월간 검색 ${formatNumber(metrics.searchDemand.value)}회`,'Naver Search Ads · 실제'],
      ['시장 규모',`${activeSnapshot?metrics.estimatedMarketUnits.period:'시장'} 판매량 추정 ${formatNumber(metrics.estimatedMarketUnits.value)}개`,'판매량 추정 모델 · ESTIMATE'],
      ['시장 위치',`표본 상위 ${metrics.marketPercentile.value}%`,`${formatNumber(metrics.marketPercentile.sampleSize)}개 검색 표본`],
      ['우리 판매',`${metrics.ownUnits.period} ${formatNumber(metrics.ownUnits.value)}개`,'Harin Orders · 실제'],
      ['경쟁 가격',`평균 ${formatWon(metrics.averageCompetitorPrice.value)}`,`Shopping Search · SAMPLE`],
      ['리뷰 근거','리뷰 분석 연결 필요','Verified Evidence · SETUP_REQUIRED']
    ];
    document.getElementById('productAnalysisMarketerMetrics').innerHTML=summary.map(([label,value,detail],index)=>`<article data-report-metric style="--report-delay:${index}"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
    const reportTime=activeSnapshot?.generatedAt||normalizedData.snapshot.generatedAt;
    text('productAnalysisReportTimestamp',`보고서 기준 ${reportTime.slice(0,16).replace('T',' ')}`);
  };

  const renderSeasonality = item => {
    const data=item.v91,search=data.series.searchSeasonality,sales=data.series.monthlySales,months=['9월','10월','11월','12월','1월','2월','3월','4월','5월','6월','7월','8월'],maxSales=Math.max(...sales.values);
    const rootElement=document.getElementById('productAnalysisSeasonality');
    rootElement.innerHTML=`<div class="seasonality-ledger-head"><span><i class="search"></i>DataLab 상대지수</span><span><i class="sales"></i>Harin Orders · 실제 출고</span><strong>서로 다른 단위를 비율로 합산하지 않음</strong></div><div class="seasonality-months">${months.map((month,index)=>`<article data-season-month="${index+1}" style="--month-delay:${index}"><span>${month}</span><div class="seasonality-heat" aria-label="${month} 검색 상대지수 ${search.values[index]}"><i style="--heat:${search.values[index]}"></i><strong>${search.values[index]}</strong></div><div class="seasonality-sales" aria-label="${month} 실제 출고 ${sales.values[index]}개"><i style="--sales:${sales.values[index]/maxSales*100}"></i><strong>${sales.values[index]}개</strong></div></article>`).join('')}</div><footer><span>검색 최고</span><strong>${months[search.values.indexOf(Math.max(...search.values))]} · ${Math.max(...search.values)}</strong><span>판매 최고</span><strong>${months[sales.values.indexOf(maxSales)]} · ${maxSales}개</strong><small>${search.period} / ${sales.period}</small></footer>`;
  };

  const renderCategoryPosition = item => {
    const data=item.v91,metric=data.metrics.marketPercentile,distribution=data.series.rankDistribution,labels=['상위 2%','상위 5%','상위 10%','상위 20%','상위 30%','상위 40%','상위 50%','상위 70%','상위 90%','전체'],ends=[2,5,10,20,30,40,50,70,90,100],max=Math.max(...distribution.values),activeIndex=ends.findIndex(value=>metric.value<=value);
    document.getElementById('productAnalysisCategoryPosition').innerHTML=`<header><span><small>현재 표본 위치</small><strong>표본 위치 상위 ${metric.value}%</strong></span><b>${formatNumber(metric.sampleSize)}개 표본</b></header><div class="category-rank-bands">${distribution.values.map((count,index)=>`<article data-rank-band class="${index===activeIndex?'active':''}" style="--rank-delay:${index}"><span>${labels[index]}</span><i><b style="--band-width:${count/max*100}"></b></i><strong>${formatNumber(count)}개</strong>${index===activeIndex?'<em>우리 위치</em>':''}</article>`).join('')}</div><footer><strong>검색 API 표본 위치 · 정확한 노출순위 아님</strong><span>광고·개인화·배송조건에 따라 달라질 수 있음</span></footer>`;
  };

  const renderGrowthScenario = item => {
    const data=item.v91,scenarios=data.samples.growthScenarios,current=scenarios.find(entry=>entry.id==='current'),profitPerUnit=data.metrics.contributionPerUnit.value,host=document.getElementById('productAnalysisGrowthScenario');
    host.innerHTML=`<header><span><small>${data.metrics.ownUnits.period} 실제</small><strong>현재 ${formatNumber(current.units)}개</strong></span><b>조건부 계산</b></header><div class="growth-scenario-controls" role="group" aria-label="성장 시나리오 선택">${scenarios.map((entry,index)=>`<button type="button" data-growth-scenario="${entry.id}" aria-pressed="${String(index===0)}" class="${index===0?'active':''}"><span>${entry.label}</span><strong>${formatNumber(entry.units)}개</strong></button>`).join('')}</div><div class="growth-scenario-result" id="productAnalysisScenarioResult"></div><p>표본 위치 개선과 판매량이 함께 움직인다는 가정입니다. 계절·광고·가격 변화는 별도 검증해야 합니다.</p>`;
    const selectScenario=id=>{
      const selected=scenarios.find(entry=>entry.id===id)||current,additional=selected.units-current.units,revenueDelta=selected.revenue-current.revenue,profit=profitPerUnit==null?null:additional*profitPerUnit;
      host.querySelectorAll('[data-growth-scenario]').forEach(button=>{const active=button.dataset.growthScenario===id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
      document.getElementById('productAnalysisScenarioResult').innerHTML=id==='current'?`<span><small>현재 확인값</small><strong>${formatNumber(current.units)}개 · ${formatRevenue(current.revenue)}</strong><em>Harin Orders 실제</em></span>`:`<span><small>${selected.label} 시나리오</small><strong>예상 ${formatNumber(selected.units)}개</strong><em>현재보다 추가 ${formatNumber(additional)}개</em></span><span><small>예상 매출 변화</small><strong>+${formatRevenue(revenueDelta)}</strong><em>${profit==null?'공헌이익 판단 보류':`추가 공헌이익 약 ${formatWon(profit)}`}</em></span>`;
    };
    host.querySelectorAll('[data-growth-scenario]').forEach(button=>button.addEventListener('click',()=>selectScenario(button.dataset.growthScenario)));
    selectScenario('current');
  };

  const renderAttributeBreakdown = item => {
    const attributes=item.v91.samples.attributeProfile;
    document.getElementById('productAnalysisAttributeBreakdown').innerHTML=`<div class="attribute-breakdown-legend"><span><i class="product"></i>내 상품</span><span><i class="market"></i>시장 중간값</span><strong>0–100 정규화 · 실제 단위 아님</strong></div><div>${attributes.map((entry,index)=>`<article data-attribute-row style="--attribute-delay:${index}"><span><strong>${entry.label}</strong><small>${entry.productValue>=entry.marketValue?'시장보다 강함':'보완 필요'}</small></span><div><i><b data-attribute-series="market" style="--attribute-width:${entry.marketValue}"></b></i><i><b data-attribute-series="product" style="--attribute-width:${entry.productValue}"></b></i></div><em><b>${entry.productValue}</b><small>/ ${entry.marketValue}</small></em></article>`).join('')}</div>`;
  };

  const renderSalesGap = item => {
    const metrics=item.v91.metrics,own=metrics.ownUnits.value,top=metrics.topCompetitorEstimatedUnits.value,ratio=top/own,gap=top-own,confidence=metrics.estimateConfidence.value;
    document.getElementById('productAnalysisSalesGap').innerHTML=`<header><span><small>판매 격차</small><strong>상위 경쟁상품이 약 ${ratio.toFixed(1)}배 커 보여요.</strong></span><b>신뢰도 ${confidence}/100</b></header><div class="sales-gap-bars"><article class="competitor"><span>상위 경쟁상품 추정</span><i><b style="--gap-width:100"></b></i><strong>${formatNumber(top)}개</strong></article><article class="own"><span>우리 실제</span><i><b style="--gap-width:${own/top*100}"></b></i><strong>${formatNumber(own)}개</strong></article></div><div class="sales-gap-number"><span><small>${metrics.ownUnits.period} 판매량 차이</small><strong>${formatNumber(gap)}개</strong></span><span><small>값의 성격</small><strong>실제 vs 추정</strong></span></div><footer><strong>판매량 추정 모델 · 추정 산식</strong><p>네이버 검색수요 × 검색 표본 위치 CTR proxy × 자사 주문 보정계수. 네이버가 제공하는 공식 경쟁사 판매량이 아닙니다.</p></footer>`;
  };

  const renderEntryBlockers = item => {
    const blockers=item.v91.samples.entryBlockers;
    document.getElementById('productAnalysisEntryBlockers').innerHTML=`<header><span><small>상위 10% 진입 방해요인</small><strong>목표와 차이가 큰 순서</strong></span><b>다음 확인</b></header><div>${[...blockers].sort((a,b)=>b.gap-a.gap).map((entry,index)=>`<article data-blocker-row data-source="${entry.source}" data-status="${entry.status}" style="--blocker-delay:${index}"><span><strong>${entry.label}</strong><small>${entry.action}</small></span><div><i><b style="--blocker-current:${entry.current}"></b><em style="--blocker-target:${entry.target}"></em></i></div><mark class="${entry.gap?'needs-work':'met'}">${entry.gap?`-${entry.gap}`:'충족'}</mark></article>`).join('')}</div><footer><span><i class="current"></i>현재</span><span><i class="target"></i>상위 10% 목표</span><strong>0–100 정규화</strong></footer>`;
  };

  const renderPriceOpportunity = item => {
    const bands=item.v91.samples.priceBands,maxProducts=Math.max(...bands.map(entry=>entry.productCount)),maxUnits=Math.max(...bands.map(entry=>entry.estimatedUnits));
    document.getElementById('productAnalysisPriceOpportunity').innerHTML=`<header><span><small>가격대별 시장 기회</small><strong>경쟁상품 수와 판매기회 추정을 함께 봐요.</strong></span><b>ESTIMATE</b></header><div>${bands.map((entry,index)=>`<article data-price-band class="${entry.own?'own':''}" style="--price-delay:${index}"><span><strong>${entry.label}</strong>${entry.own?'<em>우리 가격대</em>':''}</span><div><small>경쟁상품 수 ${formatNumber(entry.productCount)}개</small><i><b style="--price-product-width:${entry.productCount/maxProducts*100}"></b></i><small>판매기회 추정 ${formatNumber(entry.estimatedUnits)}개</small><i><b class="opportunity" style="--price-unit-width:${entry.estimatedUnits/maxUnits*100}"></b></i></div></article>`).join('')}</div><footer>Shopping Search 표본 + 수요 기반 판매량 추정 · 실제 시장 판매량 아님</footer>`;
  };

  const renderKeywordRank = item => {
    const keywords=item.v91.samples.keywords,max=Math.max(...keywords.map(entry=>entry.demand));
    document.getElementById('productAnalysisKeywordRank').innerHTML=keywords.map((entry,index)=>`<article data-keyword-row data-keyword-state="${entry.state}" style="--keyword-delay:${index}"><i>${String(index+1).padStart(2,'0')}</i><span><strong>${entry.label}</strong><small>${entry.intent} · 경쟁 ${entry.competition}</small></span><div><b style="--rank-width:${entry.demand/max*100}"></b></div><em>${formatNumber(entry.demand)}회</em><mark>${entry.state}</mark></article>`).join('');
  };

  const renderUnitPrice = item => {
    const data=item.v91,own={name:item.name,price:data.metrics.salePrice.value,packSize:data.identity.packSize,unitType:data.identity.packUnit,own:true},rows=[data.samples.competitors[0],own,...data.samples.competitors.slice(1)],compatible=rows.filter(row=>row.unitType===data.identity.packUnit),maxUnit=Math.max(...compatible.map(row=>row.price/row.packSize));
    document.getElementById('productAnalysisUnitPrice').innerHTML=rows.map((row,index)=>{const unitPrice=Math.round(row.price/row.packSize),compatibleUnit=row.unitType===data.identity.packUnit,label=row.unitType==='GRAM'?'g':'티백';return `<article data-unit-price-row class="${row.own?'own':''} ${compatibleUnit?'':'incompatible'}"><i>${row.own?'H':index+1}</i><span><strong>${row.own?'우리 상품':row.name}</strong><small>${formatWon(row.price)} ÷ ${row.packSize}${label}${compatibleUnit?'':' · 단위 다름'}</small></span><div><b style="--unit-width:${compatibleUnit?unitPrice/maxUnit*100:0}"></b></div><em>${formatNumber(unitPrice)}원/${label}</em></article>`;}).join('');
  };

  const renderFeedback = item => {
    const owned=item.v91.evidence.ownedFeedback,reviews=item.v91.evidence.verifiedReviews,max=Math.max(...owned.themes.map(theme=>theme.count));
    const outputs=reviews.outputs||['평균평점','리뷰수','긍정요인','불편요인'].map(label=>({label,status:'SETUP_REQUIRED'}));
    document.getElementById('productAnalysisFeedbackBoard').innerHTML=`<section class="owned-feedback"><header><span><small>보유 CS · 표본</small><strong>${owned.sampleSize}건에서 반복된 표현</strong></span><b>${owned.status}</b></header><div>${owned.themes.map(theme=>`<article data-feedback-theme="${theme.tone}"><span><strong>${theme.label}</strong><small>${theme.count}건</small></span><i><b style="--feedback-width:${theme.count/max*100}"></b></i></article>`).join('')}</div><footer>${owned.source} · ${owned.period} · 개인 문의 원문은 노출하지 않음</footer></section><section class="review-evidence-empty"><i aria-hidden="true">?</i><span><small>외부 경쟁 리뷰</small><strong>평점 분석 대기 · 리뷰 근거 확인 필요</strong><p>공식 API 또는 검증된 CSV·원문 Evidence가 연결되기 전에는 평점·감정·경쟁 우위를 계산하지 않아요.</p></span><b>${reviews.status}</b><div class="product-analysis-review-outputs" id="productAnalysisReviewOutputs">${outputs.map(output=>`<article data-review-output><span>${output.label}</span><strong>연결 필요</strong><small>${output.status}</small></article>`).join('')}</div></section>`;
  };

  const renderSourceDesk = item => {
    const costReady=item.v91.metrics.contributionProfit.status!=='CONFIRM_REQUIRED';
    const sources=[
      ['자사 주문·판매','Harin Orders · 실제값','READY','ready'],
      ['검색량·계절성','Search Ads + DataLab','READY','ready'],
      ['시장 위치·경쟁가격','Shopping Search · 표본','SAMPLE','sample'],
      ['성장 시나리오','Orders 기반 조건부 계산','CALCULATED','ready'],
      ['수익 계산',costReady?'Cost Ledger · 계산값':'원가 연결 필요',costReady?'CALCULATED':'확인 필요',costReady?'ready':'hold'],
      ['검증 리뷰','공식 API 또는 CSV 필요','SETUP_REQUIRED','hold']
    ];
    document.getElementById('productAnalysisSourceList').innerHTML=sources.map(([label,detail,status,tone])=>`<article><i class="source-${tone}"></i><div><strong>${label}</strong><small>${detail}</small></div><b class="${tone==='sample'?'sample':tone==='hold'?'hold':''}">${status}</b></article>`).join('');
  };

  const renderV91 = item => {
    if (!item.v91) return;
    renderDecisionBrief(item);
    renderMarketerSummary(item);
    renderSeasonality(item);
    renderCategoryPosition(item);
    renderGrowthScenario(item);
    renderAttributeBreakdown(item);
    renderSalesGap(item);
    renderEntryBlockers(item);
    renderPriceOpportunity(item);
    renderKeywordRank(item);
    renderUnitPrice(item);
    renderFeedback(item);
    renderSourceDesk(item);
  };

  const renderEvidence = item => {
    const evidence=getEvidence(item),available=availableEvidence(evidence),track=document.getElementById('productAnalysisEvidenceTrack');
    track.innerHTML=`<strong class="evidence-track-summary">${available.length}/9 · ${available.length}개 연결</strong>${evidence.map((entry,index)=>`<article role="listitem" data-evidence-source="${entry.id}" data-source="${entry.source}" data-metric-kind="${entry.kind}" data-status="${entry.status}" class="${entry.status.toLowerCase()}" style="--evidence-delay:${index}"><i aria-hidden="true"></i><span><strong>${entry.label}</strong><small>${entry.source}</small></span><em>${statusLabel[entry.status]}</em></article>`).join('')}`;
    const summary=document.getElementById('productAnalysisEvidenceReady');summary.setAttribute('aria-label',`근거 준비도 ${available.length}/9`);summary.innerHTML=`<strong>${available.length}</strong><span>/ 9</span><small>개 근거 사용 가능</small>`;
    text('productAnalysisSpineDecision',`근거 ${available.length}/9`);text('productAnalysisEvidenceStatusText',`근거 ${available.length}/9 · 부분 준비`);
  };

  const renderDataContracts = item => {
    const evidence=getEvidence(item),ids=['search-volume','search-trend','audience','price','orders','cost'],metrics=evidence.filter(entry=>ids.includes(entry.id));
    document.getElementById('productAnalysisDataContracts').innerHTML=metrics.map(entry=>`<article data-metric-contract data-value="${entry.value??''}" data-unit="${entry.unit}" data-source="${entry.source}" data-metric-kind="${entry.kind}" data-status="${entry.status}" data-period="${entry.period}" data-as-of="${entry.asOf}" data-sample-size="${entry.sampleSize??''}"><span>${entry.label}</span><strong>${entry.source}</strong><small><b>${kindLabel[entry.kind]}</b> · ${entry.period}${entry.sampleSize?` · ${entry.sampleSize}개`:''} · ${entry.status==='SETUP_REQUIRED'||entry.status==='CONFIRM_REQUIRED'?'값 확인 필요':`기준 ${entry.asOf}`}</small></article>`).join('');
    text('productAnalysisFreshness',`최신 기준 ${AS_OF} · 출처별 시점 분리`);
  };

  const renderStory = item => {
    const story=storyMeta[selectedKey];
    text('productAnalysisVerdict',story.verdict);text('productAnalysisVerdictCopy',story.copy);document.getElementById('productAnalysisVerdictTags').innerHTML=story.tags.map(([label,tone])=>`<span class="${tone}">${label}</span>`).join('');
    renderRadar();renderEvidence(item);renderDataContracts(item);
  };

  const render = ({ motion=true } = {}) => {
    const item=activeSnapshot?.product||products[selectedKey],meta=periodMeta[period],audienceAge=item.audienceSegments.male.map((value,index)=>value+item.audienceSegments.female[index]),peakAgeIndex=audienceAge.indexOf(Math.max(...audienceAge)),ageLabels=['20대','30대','40대','50대','60대+'];
    text('productAnalysisThumb',item.glyph);text('productAnalysisSelectedName',item.name);text('productAnalysisProductMeta',`옵션 ${item.option} · 기준 판매가 ${formatWon(item.priceValue)}`);
    text('productAnalysisSpineDemand',`${formatNumber(item.demandValue)}회`);text('productAnalysisSpineAudience',`${ageLabels[peakAgeIndex]} ${item.female>=58?'여성':'전체'}`);text('productAnalysisSpineMarket',item.marketCount);text('productAnalysisSpineSales',`${formatNumber(item.unitsValue)}개`);
    text('productAnalysisDemand',`${formatNumber(item.demandValue)}회`);text('productAnalysisDemandNote',`PC ${formatNumber(item.demandPc)} · 모바일 ${formatNumber(item.demandMobile)}`);text('productAnalysisAudience',`${ageLabels[peakAgeIndex]} ${item.female>=58?'여성':'전체'}`);text('productAnalysisAudienceNote',`여성 ${item.female}% · ${ageLabels[peakAgeIndex]} ${audienceAge[peakAgeIndex]}%`);text('productAnalysisMarketCount',item.marketCount);
    text('productAnalysisProfit',item.profitValue==null?'확인 필요':formatRevenue(item.profitValue));text('productAnalysisProfitNote',item.profitValue==null?'포장 원가 누락 · 판단 보류':`이익률 ${item.profitRate}% · 원가 근거 연결`);
    text('productAnalysisTrendTitle',`${item.keyword} 검색 흐름`);text('productAnalysisTrendSummary',item.trendSummary);text('productAnalysisPrice',formatWon(item.priceValue));text('productAnalysisEvidenceTitle',`${item.short} 근거`);text('productAnalysisEvidenceMeta',`대표키워드 ${item.keyword} · ${meta.short}`);text('productAnalysisNextAction',item.next);text('productAnalysisPeriodLabel',meta.label);text('productAnalysisEvidencePeriod',activeSnapshot?`${meta.short} · 동일 기간 실적 집계`:meta.aside);
    renderStory(item);renderTrend(item);renderAudience(item);renderPrice(item);renderSales(item);renderKeywords(item);renderCompetitors(item);renderV91(item);
    if (window.HarinChannelLogo) window.HarinChannelLogo.normalizeAll(root);
    if (motion) animate();
  };

  const syncPeriodControls = () => root.querySelectorAll('[data-product-analysis-period]').forEach(control=>{const active=Number(control.dataset.productAnalysisPeriod)===period;control.classList.toggle('active',active);control.setAttribute('aria-pressed',String(active));});
  const setPeriod = (value,{ renderNow=true }={}) => { if (!periodMeta[value]) return;period=Number(value);syncPeriodControls();if (renderNow) render(); };
  document.getElementById('productAnalysisSelect')?.addEventListener('change',event=>{activeSnapshot=null;selectedKey=event.currentTarget.value;render();});
  root.querySelectorAll('[data-product-analysis-period]').forEach(button=>button.addEventListener('click',()=>{activeSnapshot=null;setPeriod(Number(button.dataset.productAnalysisPeriod));}));
  const chapterTargets={summary:'productAnalysisSummary',demand:'productAnalysisDemandChapter',audience:'productAnalysisAudienceChapter',price:'productAnalysisPriceChapter',sales:'productAnalysisSalesChapter',competition:'productAnalysisCompetitionChapter'};
  root.querySelectorAll('[data-product-analysis-chapter]').forEach(button=>button.addEventListener('click',()=>{ root.querySelectorAll('[data-product-analysis-chapter]').forEach(control=>{const active=control===button;control.classList.toggle('active',active);control.setAttribute('aria-current',String(active));}); const target=document.getElementById(chapterTargets[button.dataset.productAnalysisChapter]); target?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'}); }));
  window.ProductAnalysisPreview={
    products,data:normalizedData,render,setPeriod,
    select:key=>{if(!products[key])return;activeSnapshot=null;selectedKey=key;document.getElementById('productAnalysisSelect').value=key;render();},
    renderSnapshot:snapshot=>{if(!snapshot?.product||!products[snapshot.productKey])return;activeSnapshot=snapshot;selectedKey=snapshot.productKey;period=Number(snapshot.periodDays);document.getElementById('productAnalysisSelect').value=selectedKey;syncPeriodControls();render();},
    clearSnapshot:()=>{activeSnapshot=null;},
    getSelection:()=>({productKey:selectedKey,periodDays:period,snapshotId:activeSnapshot?.id||null}),
    getEvidence:()=>getEvidence(activeSnapshot?.product||products[selectedKey])
  };
  render({motion:false});
})();
