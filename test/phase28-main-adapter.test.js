'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPhase28MainModel,PHASE28_AVAILABLE_ADAPTERS}=require('../lib/ui/phase28-adapters/index.js');

test('main adapter preserves missing money as blocked evidence',()=>{
  const model=buildPhase28MainModel({salesCommandCenter:{metrics:{current:null}}});
  assert.equal(model.metrics.current.status,'BLOCKED');
  assert.equal(model.metrics.current.value,null);
  assert.ok(model.metrics.current.reasons.includes('VALUE_MISSING'));
});

test('main adapter keeps a confirmed numeric zero',()=>{
  const model=buildPhase28MainModel({salesCommandCenter:{metrics:{current:0}}});
  assert.equal(model.metrics.current.status,'READY');
  assert.equal(model.metrics.current.value,0);
});

test('missing Main counts stay unknown instead of becoming zero',()=>{
  const model=buildPhase28MainModel({salesCommandCenter:{daily:{},metrics:{},cashflow:{}}});
  assert.equal(model.hero.taskCount,null);
  assert.equal(model.hero.exceptionCount,null);
  assert.equal(model.hero.status,'BLOCKED');
  assert.equal(model.hero.headline,'오늘 운영 건수는 확인이 필요해요.');
});

test('measured zero Main counts remain ready evidence',()=>{
  const model=buildPhase28MainModel({salesCommandCenter:{daily:{total:0,exception_total:0},metrics:{},cashflow:{}}});
  assert.equal(model.hero.taskCount,0);
  assert.equal(model.hero.exceptionCount,0);
  assert.equal(model.hero.status,'READY');
});

test('main adapter labels an empty-month forecast as sample required instead of zero won',()=>{
  const model=buildPhase28MainModel({
    generatedAt:'2026-09-01T00:55:00+09:00',
    salesCommandCenter:{
      month:'2026-09',
      metrics:{current:0,currentSampleSize:0,forecast:null,forecastStatus:'SAMPLE_REQUIRED'}
    }
  });
  assert.equal(model.metrics.current.value,0);
  assert.equal(model.metrics.current.sampleSize,0);
  assert.equal(model.metrics.current.period,'2026-09');
  assert.equal(model.metrics.forecast.value,null);
  assert.ok(model.metrics.forecast.reasons.includes('SAMPLE_REQUIRED'));
});

test('main hero chooses the highest-priority memo when today has several memos',()=>{
  const model=buildPhase28MainModel({
    generatedAt:'2026-08-31T10:00:00+09:00',
    calendarEntries:[
      {id:'normal',item_type:'NOTE',title:'보통 메모',priority:'NORMAL',due_at:'2026-08-30T15:00:00.000Z',status:'OPEN'},
      {id:'high',item_type:'NOTE',title:'중요 메모',priority:'HIGH',due_at:'2026-08-30T15:00:00.000Z',status:'OPEN'}
    ]
  });
  assert.equal(model.hero.note,'중요 메모');
  assert.deepEqual(model.calendar.items.map(item=>item.title),['중요 메모','보통 메모']);
});

test('main adapter reuses server-owned schedules, decisions, channels, and growth signals',()=>{
  const model=buildPhase28MainModel({
    generatedAt:'2026-08-29T01:40:00.000Z',
    financialTrust:{status:'READY'},
    salesCommandCenter:{
      metrics:{target:85000000,current:60829400,forecast:72527360},
      likelihood:{code:'WATCH',label:'조금 더 필요',description:'현재 속도를 유지하세요.'},
      actions:[{id:'ship',title:'출고 2건 처리',view:'orders',platform:'ALL'}],
      channels:[{platform:'NAVER',status:'READY',label:'정상'}],
      products:{growth:[{key:'p1',name:'작두콩차',platform:'CAFE24',currentRevenue:1280000,growthRate:8.4}],risk:[]},
      cashflow:{status:'ESTIMATE',expectedBalance:12634200,description:'예상치'},
      daily:{total:3,exception_total:1,schedule:{items:[{id:'SHIP',time:'09:00–15:00',label:'오늘 출고 주문 처리',status:'NOW',view:'orders'}]}}
    }
  });

  assert.equal(model.hero.taskCount,3);
  assert.equal(model.schedule[0].id,'SHIP');
  assert.equal(model.decisions[0].view,'orders');
  assert.equal(model.channels[0].platform,'NAVER');
  assert.equal(model.growth[0].name,'작두콩차');
  assert.equal(model.metrics.balance.status,'PARTIAL');
  assert.deepEqual(PHASE28_AVAILABLE_ADAPTERS,['main','calendar','orders','cs','inventory','products','settlement','keywords','product-analysis','insights','development','system','notifications','diagnoses','changes','validation','experiments','knowledge']);
});

test('main growth horizon combines saved weekly insights and product analysis evidence',()=>{
  const model=buildPhase28MainModel({
    generatedAt:'2026-08-31T01:20:00.000Z',
    salesCommandCenter:{products:{growth:[]}},
    reports:[
      {
        id:'weekly-naver',platform:'NAVER',report_type:'WEEKLY',status:'FINAL',is_latest:true,
        period_end:'2026-08-30',created_at:'2026-08-31T00:30:00.000Z',title:'네이버 주간 인사이트',
        summary_json:{insights:[{level:'good',title:'브랜드 검색 유입 상승',body:'같은 채널의 저장 근거로 확인했습니다.'}]}
      },
      {
        id:'analysis-p1',platform:'ALL',report_type:'PRODUCT_ANALYSIS_p1',status:'FINAL',is_latest:true,
        period_end:'2026-08-30',created_at:'2026-08-31T00:20:00.000Z',title:'작두콩차 상품분석',
        summary_json:{kind:'PRODUCT_ANALYSIS',product:{id:'p1',name:'작두콩차'},metrics:{revenue:1280000,search_demand:15330},signals:[
          {tone:'good',title:'판매 실적 확인',body:'선택 기간 실제 매출이 확인됐습니다.'},
          {tone:'hold',title:'경쟁 근거 연결 필요',body:'추정하지 않습니다.'}
        ]}
      }
    ]
  });

  assert.equal(model.growthSources.insights.reportCount,1);
  assert.equal(model.growthSources.productAnalysis.reportCount,1);
  assert.deepEqual(new Set(model.growth.map(item=>item.source)),new Set(['INSIGHT','PRODUCT_ANALYSIS']));
  assert.ok(model.growth.some(item=>item.name==='작두콩차'&&item.currentRevenue===1280000));
  assert.ok(model.growth.some(item=>item.name==='브랜드 검색 유입 상승'&&item.destination==='insights'));
  assert.equal(model.growth.some(item=>item.name==='경쟁 근거 연결 필요'),false);
});

test('main adapter supplies the complete V106 money, deadline, forecast, and payout evidence',()=>{
  const model=buildPhase28MainModel({
    generatedAt:'2026-08-29T05:42:00.000Z',
    financialTrust:{status:'READY'},
    liveProfitability:{
      revenue:60829400,product_cost:22000000,shipping_cost:7200000,fees:4100000,ad_spend:4800000,
      contribution_profit:22729400,cost_coverage_rate:96
    },
    cafe24Analytics:{daily:[
      {date:'2026-08-23',orders:3,revenue:120000},{date:'2026-08-24',orders:4,revenue:180000},
      {date:'2026-08-25',orders:5,revenue:210000},{date:'2026-08-26',orders:4,revenue:190000},
      {date:'2026-08-27',orders:6,revenue:240000},{date:'2026-08-28',orders:5,revenue:220000},
      {date:'2026-08-29',orders:7,revenue:280000}
    ]},
    unifiedSettlement:{schedules:[
      {platform:'NAVER',date:'2026-08-30',status:'정산예정',amount:2410000},
      {platform:'COUPANG',date:'2026-09-10',status:'예정',amount:900000}
    ]},
    salesCommandCenter:{
      metrics:{target:85000000,current:60829400,forecast:72527360},
      cashflow:{status:'ESTIMATE',expectedBalance:12634200},
      daily:{total:3,exception_total:1,schedule:{cutoff_at:'2026-08-29T15:00:00+09:00',items:[]}}
    }
  });

  assert.equal(model.metrics.profit.value,22729400);
  assert.equal(model.deadline.at,'2026-08-29T15:00:00+09:00');
  assert.deepEqual(model.cashflow.rows.map(item=>item.key),['sales','operating','fees','profit']);
  assert.equal(model.forecast.days.length,7);
  assert.equal(model.forecast.status,'PARTIAL');
  assert.equal(model.cashCalendar.length,1);
  assert.equal(model.cashCalendar[0].platform,'NAVER');
});

test('main payout calendar distinguishes no upcoming amount from missing settlement evidence',()=>{
  const model=buildPhase28MainModel({
    generatedAt:'2026-09-01T12:00:00+09:00',
    unifiedSettlement:{schedules:[
      {platform:'COUPANG',date:'2026-09-07',status:'SUBJECT',amount:0},
      {platform:'COUPANG',date:'2026-09-18',status:'SUBJECT',amount:34_747}
    ]},
    salesCommandCenter:{daily:{total:0,exception_total:0,schedule:{items:[]}}}
  });
  assert.equal(model.cashCalendar.length,0);
  assert.equal(model.cashCalendarMeta.status,'NO_SCHEDULE');
  assert.equal(model.cashCalendarMeta.next.date,'2026-09-18');
  assert.equal(model.cashCalendarMeta.next.amount,34_747);
});

test('main cashflow uses the measured monthly sales and forecasts from the lightweight order history',()=>{
  const model=buildPhase28MainModel({
    generatedAt:'2026-08-31T12:00:00+09:00',
    salesHistory:{
      status:'READY',channels:['NAVER','COUPANG','CAFE24'],
      daily:[
        {date:'2026-08-25',orders:1,revenue:100_000},
        {date:'2026-08-26',orders:2,revenue:200_000},
        {date:'2026-08-27',orders:3,revenue:300_000}
      ]
    },
    salesCommandCenter:{
      metrics:{current:6_566_330},
      cashflow:{status:'CHECK_REQUIRED',description:'비용 근거 확인 필요'},
      daily:{total:0,exception_total:0,schedule:{items:[]}}
    }
  });

  assert.equal(model.cashflow.rows[0].value,6_566_330);
  assert.equal(model.cashflow.rows[1].value,null);
  assert.equal(model.forecast.status,'PARTIAL');
  assert.equal(model.forecast.actualRevenue,600_000);
  assert.deepEqual(model.forecast.actualDays.map(item=>item.revenue),[100_000,200_000,300_000]);
  assert.equal(model.forecast.expectedRevenue,1_400_000);
  assert.match(model.forecast.basis,/네이버·쿠팡·Cafe24/);
});

test('main cashflow rows prefer the automated current-month financial snapshot',()=>{
  const model=buildPhase28MainModel({
    generatedAt:'2026-08-31T12:00:00+09:00',
    mainCashflow:{
      status:'READY',description:'이번 달 비용 자동 계산',sales:8_327_610,
      operatingCost:3_100_000,feesAndAds:1_220_000,profit:4_007_610,
      productCost:2_600_000,shippingCost:500_000,platformFees:720_000,adSpend:500_000,
      costCoverageRate:98.4,itemEvidenceRate:99.1
    },
    salesCommandCenter:{
      metrics:{current:8_327_610},cashflow:{status:'CHECK_REQUIRED'},
      daily:{total:0,exception_total:0,schedule:{items:[]}}
    }
  });

  assert.equal(model.cashflow.status,'READY');
  assert.equal(model.cashflow.rows.find(item=>item.key==='operating').value,3_100_000);
  assert.equal(model.cashflow.rows.find(item=>item.key==='fees').value,1_220_000);
  assert.equal(model.cashflow.rows.find(item=>item.key==='profit').value,4_007_610);
  assert.match(model.cashflow.description,/자동 계산/);
  assert.equal(model.metrics.profit.value,4_007_610);
});
