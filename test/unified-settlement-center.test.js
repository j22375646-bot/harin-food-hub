'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildUnifiedSettlementCenter } = require('../lib/settlement/unified-center.js');

const now = new Date('2026-08-14T03:00:00Z');

test('Cafe24 주문과 비용 설정으로 예상 정산액을 계산한다', () => {
  const center=buildUnifiedSettlementCenter({now,cafe24Orders:[
    {order_id:'C1',order_date:'2026-08-10T10:00:00+09:00',paid_amount:100000,cancel_amount:10000},
    {order_id:'C2',order_date:'2026-08-11T10:00:00+09:00',paid_amount:50000,cancel_amount:0}
  ],channelCostSettings:[{platform:'CAFE24',commission_rate:.05,payment_fee_rate:.03,default_shipping_cost:3000}]});
  const cafe=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe.status,'ESTIMATED');
  assert.equal(cafe.gross_sales,150000);
  assert.equal(cafe.refunds,10000);
  assert.equal(cafe.fees,11200);
  assert.equal(cafe.logistics,6000);
  assert.equal(cafe.expected_payout,128800);
});

test('비용 설정이 없으면 Cafe24 예상 정산액을 0원으로 만들지 않는다', () => {
  const center=buildUnifiedSettlementCenter({now,cafe24Orders:[{order_id:'C1',order_date:'2026-08-10',paid_amount:100000}]});
  const cafe=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe.status,'COST_REQUIRED');
  assert.equal(cafe.fees,null);
  assert.equal(cafe.expected_payout,null);
  assert.equal(center.summary.estimated_payout,null);
});

test('Cafe24 매출통계 API가 있으면 주문 추정 대신 결제·환불 원문을 사용한다', () => {
  const center=buildUnifiedSettlementCenter({now,
    cafe24Orders:[{order_id:'C1',order_date:'2026-08-10',paid_amount:999999}],
    cafe24SalesDaily:[
      {date:'2026-08-10',payment_amount:150000,refund_amount:12000,sales_count:4,source_status:'OK'}
    ],
    channelCostSettings:[{platform:'CAFE24',commission_rate:.05,payment_fee_rate:.03,default_shipping_cost:3000}]
  });
  const cafe=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe.status,'ESTIMATED');
  assert.equal(cafe.gross_sales,150000);
  assert.equal(cafe.refunds,12000);
  assert.equal(cafe.order_count,4);
  assert.equal(cafe.actual_payout,null);
  assert.match(cafe.basis,/매출통계 API/);
});

test('Cafe24 매출통계 권한이 저장 토큰에 없으면 OAuth 재연결을 안내한다', () => {
  const center=buildUnifiedSettlementCenter({now,
    cafe24Token:{access_token:'stored',scopes:['mall.read_order','mall.read_analytics']},
    cafe24Orders:[{order_id:'C1',order_date:'2026-08-10',paid_amount:100000,cancel_amount:0}],
    channelCostSettings:[{platform:'CAFE24',commission_rate:.05,payment_fee_rate:.03,default_shipping_cost:3000}],
    syncs:[{platform:'CAFE24',job_type:'FETCH_ALL',status:'PARTIAL',finished_at:'2026-08-14T02:00:00Z',metadata:{capabilities:{settlement:'SETUP_REQUIRED'}}}]
  });
  const cafe=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe.status,'RECONNECT_REQUIRED');
  assert.equal(cafe.expected_payout,92000);
  assert.equal(cafe.actual_payout,null);
  assert.equal(cafe.action_href,'/oauth/cafe24/start');
  assert.match(cafe.basis,/OAuth 재연결 필요/);
  assert.equal(center.summary.estimated_payout,null);
});

test('Cafe24 주문이 없는 달에도 매출통계 재연결 필요를 정상 무매출로 숨기지 않는다', () => {
  const center=buildUnifiedSettlementCenter({now,
    cafe24Token:{access_token:'stored',scopes:['mall.read_order','mall.read_analytics']},
    syncs:[{platform:'CAFE24',job_type:'FETCH_ALL',status:'PARTIAL',finished_at:'2026-08-14T02:00:00Z',metadata:{capabilities:{settlement:'SETUP_REQUIRED'}}}]
  });
  const cafe=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe.status,'RECONNECT_REQUIRED');
  assert.equal(cafe.gross_sales,null);
  assert.equal(cafe.action_href,'/oauth/cafe24/start');
});

test('Cafe24 이전 매출통계가 남아도 현재 토큰 범위 누락을 정상 수집으로 오인하지 않는다', () => {
  const center=buildUnifiedSettlementCenter({now,
    cafe24Token:{access_token:'stored',scopes:['mall.read_order','mall.read_analytics']},
    cafe24SalesDaily:[{date:'2026-08-10',payment_amount:100000,refund_amount:0,sales_count:1}]
  });
  const cafe=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe.status,'RECONNECT_REQUIRED');
  assert.match(cafe.basis,/새 수집.*OAuth 재연결 필요/);
  assert.equal(cafe.actual_payout,null);
});

test('Cafe24 토큰 범위가 있어도 실제 매출통계 API가 403이면 개발자 승인을 계속 표시한다', () => {
  const center=buildUnifiedSettlementCenter({now,
    cafe24Token:{access_token:'stored',scopes:['mall.read_order','mall.read_salesreport']},
    cafe24Orders:[{order_id:'C1',order_date:'2026-08-10',paid_amount:100000,cancel_amount:0}],
    syncs:[{platform:'CAFE24',job_type:'FETCH_ALL',status:'PARTIAL',finished_at:'2026-08-14T02:00:00Z',metadata:{capabilities:{settlement:'APPROVAL_REQUIRED'}}}]
  });
  const cafe=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe.status,'APPROVAL_REQUIRED');
  assert.match(cafe.action_href,/^https:\/\/developers\.cafe24\.com\//);
});

test('쿠팡 매출·환불·수수료와 확정 지급액을 분리한다', () => {
  const center=buildUnifiedSettlementCenter({now,coupangSettlements:[
    {order_id:'O1',recognition_date:'2026-08-10',sale_type:'SALE',sale_amount:100000,service_fee:10000,service_fee_vat:1000,settlement_amount:89000},
    {order_id:'O2',recognition_date:'2026-08-11',sale_type:'REFUND',sale_amount:20000,service_fee:-2000,service_fee_vat:-200,settlement_amount:-17800}
  ],coupangSettlementSummaries:[{settlement_date:'2026-08-13',final_amount:71200,status:'DONE'}]});
  const coupang=center.channels.find(item=>item.platform==='COUPANG');
  assert.equal(coupang.status,'ACTUAL');
  assert.equal(coupang.gross_sales,100000);
  assert.equal(coupang.refunds,20000);
  assert.equal(coupang.fees,8800);
  assert.equal(coupang.actual_payout,71200);
  assert.equal(center.summary.actual_payout,71200);
});

test('쿠팡 예정 정산은 아직 0인 최종 지급액 대신 예정 지급액을 사용한다', () => {
  const center=buildUnifiedSettlementCenter({now,coupangSettlementSummaries:[
    {recognition_month:'2026-08',settlement_type:'WEEKLY',settlement_date:'2026-08-18',status:'SUBJECT',settlement_target_amount:138392,settlement_amount:96876,final_amount:0},
    {recognition_month:'2026-08',settlement_type:'RESERVE',settlement_date:'2026-09-01',status:'SUBJECT',settlement_target_amount:714187,settlement_amount:499931,final_amount:0}
  ]});

  assert.equal(center.schedules.find(item=>item.date==='2026-08-18').amount,96_876);
  assert.equal(center.schedules.find(item=>item.date==='2026-09-01').amount,499_931);
});

test('쿠팡 광고 정산 요약을 광고비로 분리하고 예상 정산액에서 한 번만 차감한다', () => {
  const center=buildUnifiedSettlementCenter({now,coupangSettlements:[
    {order_id:'O1',recognition_date:'2026-08-10',sale_type:'SALE',sale_amount:100000,service_fee:9000,service_fee_vat:1000,settlement_amount:90000}
  ],coupangAdSettlements:[
    {date:'2026-08-10',row_type:'DELIVERY_SUMMARY',delivery_type:'판매자배송',chargeable_ad_spend:30000,vat:3000,billed_amount:33000},
    {date:'2026-08-10',row_type:'CAMPAIGN',campaign_id:'campaign-1',chargeable_ad_spend:30000,vat:0,billed_amount:0}
  ],coupangSettlementSummaries:[{settlement_date:'2026-08-13',final_amount:57000,status:'DONE'}]});
  const coupang=center.channels.find(item=>item.platform==='COUPANG');
  assert.equal(coupang.advertising,33000);
  assert.equal(coupang.logistics,null);
  assert.equal(coupang.expected_payout,57000);
  assert.equal(coupang.actual_payout,57000);
  assert.equal(coupang.payout_variance,0);
  assert.equal(center.waterfall.advertising,33000);
  assert.equal(center.summary.known_advertising,33000);
});

test('금액이 비어 있는 쿠팡 광고 정산 행은 광고비 0원으로 만들지 않는다', () => {
  const center=buildUnifiedSettlementCenter({now,coupangSettlements:[
    {order_id:'O1',recognition_date:'2026-08-10',sale_type:'SALE',sale_amount:100000,service_fee:9000,service_fee_vat:1000,settlement_amount:90000}
  ],coupangAdSettlements:[
    {date:'2026-08-10',row_type:'DELIVERY_SUMMARY',delivery_type:'판매자배송'}
  ]});
  const coupang=center.channels.find(item=>item.platform==='COUPANG');
  assert.equal(coupang.advertising,null);
  assert.equal(coupang.expected_payout,null);
  assert.equal(center.summary.known_advertising,null);
});

test('쿠팡 판매자배송과 로켓그로스 정산·광고·물류비를 채널별로 분리한다', () => {
  const center=buildUnifiedSettlementCenter({now,
    coupangRgOrders:[
      {order_id:'RG-1',paid_at:'2026-08-10T10:00:00+09:00',total_amount:100000}
    ],
    coupangRgOrderItems:[
      {order_id:'RG-1',vendor_item_id:'RG-VI-1',quantity:1,amount:100000}
    ],
    coupangSettlements:[
      {order_id:'SELLER-1',vendor_item_id:'SELLER-VI-1',recognition_date:'2026-08-10',sale_type:'SALE',sale_amount:80000,service_fee:7000,service_fee_vat:1000,settlement_amount:72000},
      {order_id:'RG-1',vendor_item_id:'RG-VI-1',recognition_date:'2026-08-10',sale_type:'SALE',sale_amount:100000,service_fee:9000,service_fee_vat:1000,settlement_amount:90000}
    ],
    coupangCostTransactions:[
      {source_type:'SHIPPING',event_date:'2026-08-10',order_id:'SELLER-1',vendor_item_id:'SELLER-VI-1',cost_amount:3000,cost_vat:0,credit_amount:0},
      {source_type:'SALES_COMMISSION',event_date:'2026-08-10',order_id:'RG-1',vendor_item_id:'RG-VI-1',cost_amount:9000,cost_vat:1000,credit_amount:0},
      {source_type:'WAREHOUSING',event_date:'2026-08-10',order_id:'RG-1',vendor_item_id:'RG-VI-1',cost_amount:2000,cost_vat:200,credit_amount:0},
      {source_type:'SHIPPING',event_date:'2026-08-10',order_id:'RG-1',vendor_item_id:'RG-VI-1',cost_amount:6000,cost_vat:600,credit_amount:0},
      {source_type:'STORAGE',event_date:'2026-08-10',cost_amount:500,cost_vat:0,credit_amount:0,raw_data:{source_file:'STORAGE_FEE.xlsx'}}
    ],
    coupangAdSettlements:[
      {date:'2026-08-10',row_type:'DELIVERY_SUMMARY',delivery_type:'SELLER',billed_amount:11000},
      {date:'2026-08-10',row_type:'DELIVERY_SUMMARY',delivery_type:'ROCKETGROWTH',billed_amount:33000}
    ]
  });

  const seller=center.channels.find(item=>item.platform==='COUPANG');
  const rocket=center.channels.find(item=>item.platform==='COUPANG_RG');
  assert.equal(seller.label,'쿠팡 판매자배송');
  assert.equal(seller.gross_sales,80000);
  assert.equal(seller.logistics,3000);
  assert.equal(seller.advertising,11000);
  assert.equal(seller.expected_payout,58000);
  assert.equal(rocket.label,'쿠팡 로켓그로스');
  assert.equal(rocket.gross_sales,100000);
  assert.equal(rocket.fees,10000);
  assert.equal(rocket.logistics,9300);
  assert.equal(rocket.advertising,33000);
  assert.equal(rocket.expected_payout,47700);
  assert.equal(rocket.actual_payout,null);
  assert.equal(rocket.status,'ESTIMATED');
  assert.equal(rocket.settlement_order_count,1);
  assert.equal(rocket.settlement_coverage,100);
  assert.equal(center.waterfall.gross_sales,180000);
  assert.equal(center.waterfall.logistics,12300);
  assert.equal(center.waterfall.advertising,44000);
  assert.equal(center.waterfall.expected_payout,105700);
  assert.deepEqual(center.waterfall.revenue_breakdown,[
    {platform:'COUPANG',label:'쿠팡 판매자배송',gross_sales:80000,expected_payout:58000},
    {platform:'COUPANG_RG',label:'쿠팡 로켓그로스',gross_sales:100000,expected_payout:47700}
  ]);
  assert.deepEqual(center.waterfall.rocket_growth,{
    gross_sales:100000,
    refunds:0,
    fees:10000,
    logistics:9300,
    advertising:33000,
    deductions:52300,
    expected_payout:47700,
    actual_payout:null,
    included_in_total_gross:true
  });
});

test('로켓그로스 주문보다 정산 연결 범위가 부족하면 확정 지급액과 예상액을 만들지 않는다', () => {
  const center=buildUnifiedSettlementCenter({now,
    coupangRgOrders:[
      {order_id:'RG-1',paid_at:'2026-08-10T10:00:00+09:00',total_amount:100000},
      {order_id:'RG-2',paid_at:'2026-08-11T10:00:00+09:00',total_amount:50000}
    ],
    coupangRgOrderItems:[
      {order_id:'RG-1',vendor_item_id:'RG-VI-1',quantity:1,amount:100000},
      {order_id:'RG-2',vendor_item_id:'RG-VI-2',quantity:1,amount:50000}
    ],
    coupangSettlements:[
      {order_id:'RG-1',vendor_item_id:'RG-VI-1',recognition_date:'2026-08-10',sale_type:'SALE',sale_amount:100000,service_fee:9000,service_fee_vat:1000,settlement_amount:90000}
    ],
    coupangAdSettlements:[
      {date:'2026-08-10',row_type:'DELIVERY_SUMMARY',delivery_type:'ROCKETGROWTH',billed_amount:33000}
    ]
  });
  const rocket=center.channels.find(item=>item.platform==='COUPANG_RG');
  assert.equal(rocket.gross_sales,150000);
  assert.equal(rocket.settlement_order_count,1);
  assert.equal(rocket.settlement_coverage,50);
  assert.equal(rocket.actual_payout,null);
  assert.equal(rocket.expected_payout,null);
  assert.equal(rocket.status,'COST_REQUIRED');
  assert.match(rocket.basis,/정산 연결 1\/2건/);
  assert.match(rocket.action,/정산 연결 50%/);
  assert.match(rocket.action,/WING 정산 원문/);
  assert.equal(center.waterfall.expected_payout,null);
});

test('판매자배송과 로켓그로스가 함께 있으면 미분리 쿠팡 지급 일정을 한 채널에 귀속하지 않는다',()=>{
  const center=buildUnifiedSettlementCenter({now,
    coupangRgOrders:[{order_id:'RG-1',paid_at:'2026-08-10T10:00:00+09:00',total_amount:100000}],
    coupangRgOrderItems:[{order_id:'RG-1',vendor_item_id:'RG-VI-1',quantity:1,amount:100000}],
    coupangSettlementSummaries:[{recognition_month:'2026-08',settlement_type:'WEEKLY',settlement_date:'2026-08-13',status:'DONE',final_amount:90000}]
  });
  assert.equal(center.schedules[0].platform,'COUPANG_COMBINED');
  assert.match(center.schedules[0].type,/판매자배송·로켓그로스 미분리/);
  assert.equal(center.channels.find(item=>item.platform==='COUPANG_RG').actual_payout,null);
});

test('네이버 커머스 정산 자료가 없으면 0원이 아닌 자료 없음으로 표시한다', () => {
  const center=buildUnifiedSettlementCenter({now});
  const naver=center.channels.find(item=>item.platform==='NAVER');
  assert.equal(naver.status,'NO_DATA');
  assert.equal(naver.gross_sales,null);
  assert.match(naver.action,/커머스 수집을 다시 실행/);
});

test('네이버 커머스 정산완료 자료를 매출·수수료·입금액으로 표시한다', () => {
  const center=buildUnifiedSettlementCenter({now,
    naverOrders:[{order_id:'N1',payment_date:'2026-08-10T10:00:00+09:00'}],
    naverSettlements:[{
      settle_basis_end_date:'2026-08-10',settle_expect_date:'2026-08-12',settle_complete_date:'2026-08-13',
      pay_settle_amount:100000,commission_settle_amount:6000,settle_amount:94000
    }]
  });
  const naver=center.channels.find(item=>item.platform==='NAVER');
  assert.equal(naver.status,'ACTUAL');
  assert.equal(naver.gross_sales,100000);
  assert.equal(naver.fees,6000);
  assert.equal(naver.expected_payout,94000);
  assert.equal(naver.actual_payout,94000);
  assert.equal(naver.order_count,1);
  assert.equal(center.schedules.some(item=>item.platform==='NAVER'&&item.amount===94000),true);
});

test('네이버 비즈머니 충전과 실제 차감 광고비를 분리해 정산 대조한다',()=>{
  const center=buildUnifiedSettlementCenter({now,
    naverOrders:[{order_id:'N1',payment_date:'2026-08-10T10:00:00+09:00'}],
    naverSettlements:[{
      settle_basis_end_date:'2026-08-10',settle_expect_date:'2026-08-12',settle_complete_date:'2026-08-13',
      pay_settle_amount:100000,commission_settle_amount:6000,settle_amount:94000
    }],
    naverAdStats:[{date:'2026-08-10',entity_type:'CAMPAIGN',cost:24000}],
    naverBizmoneyDaily:[{
      date:'2026-08-10',charged_purchased:110000,charged_free:5000,
      used_purchased:22000,used_free:3000,closing_balance:90000,current_balance:90000,
      charge_events:2,deduction_events:1,updated_at:'2026-08-11T00:00:00Z'
    }]
  });
  const naver=center.channels.find(item=>item.platform==='NAVER');
  assert.equal(naver.advertising,25000);
  assert.equal(naver.advertising_stats,24000);
  assert.equal(naver.advertising_charged,115000);
  assert.equal(naver.advertising_balance,90000);
  assert.equal(naver.advertising_variance,1000);
  assert.equal(naver.advertising_source,'BIZMONEY_EXHAUST');
  assert.equal(center.waterfall.advertising,25000);
  assert.equal(center.waterfall.advertising_charged,115000);
});

test('네이버 충전만 있을 때 충전액을 광고비로 차감하지 않는다',()=>{
  const center=buildUnifiedSettlementCenter({now,
    naverOrders:[{order_id:'N1',payment_date:'2026-08-10T10:00:00+09:00'}],
    naverSettlements:[{settle_basis_end_date:'2026-08-10',settle_expect_date:'2026-08-12',pay_settle_amount:100000,commission_settle_amount:6000,settle_amount:94000}],
    naverBizmoneyDaily:[{date:'2026-08-10',charged_purchased:330000,charged_free:0,used_purchased:null,used_free:null}]
  });
  const naver=center.channels.find(item=>item.platform==='NAVER');
  assert.equal(naver.advertising,null);
  assert.equal(naver.advertising_charged,330000);
  assert.equal(center.waterfall.advertising,null);
});

test('채널 조회 실패는 저장된 0원 대신 자료 확인 필요로 격리한다', () => {
  const center=buildUnifiedSettlementCenter({now,unavailable:{CAFE24:true,COUPANG:true,NAVER:true}});
  assert.equal(center.summary.actual_payout,null);
  assert.equal(center.summary.estimated_payout,null);
  assert.equal(center.summary.check_required_channels,3);
  assert.ok(center.channels.every(item=>item.status==='UNAVAILABLE'));
});

test('Cafe24 토큰 범위가 연결되어도 최근 매출통계 호출이 403이면 개발자 승인 필요로 표시한다',()=>{
  const center=buildUnifiedSettlementCenter({now,
    cafe24Token:{access_token:'token',scope:'mall.read_order mall.read_salesreport'},
    cafe24Orders:[{order_id:'C1',order_date:'2026-08-10',paid_amount:100000}],
    channelCostSettings:[{platform:'CAFE24',commission_rate:0.03,payment_fee_rate:0.02,default_shipping_cost:3000}],
    syncs:[{
      platform:'CAFE24',job_type:'FETCH_ALL',status:'PARTIAL',finished_at:'2026-08-11T00:00:00Z',
      metadata:{capabilities:{settlement:'SETUP_REQUIRED'},errors:[{dataset:'salesDaily',status:403,code:'SETUP_REQUIRED'}]}
    }]
  });
  const cafe24=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe24.status,'APPROVAL_REQUIRED');
  assert.match(cafe24.basis,/개발자 승인 필요/);
  assert.match(cafe24.action,/개발자센터/);
});

test('Cafe24 기본 0원 비용 행은 실제 비용 설정으로 인정하지 않는다',()=>{
  const center=buildUnifiedSettlementCenter({now,
    cafe24Token:{access_token:'token',scope:'mall.read_order mall.read_salesreport'},
    cafe24Orders:[{order_id:'C1',order_date:'2026-08-10',paid_amount:100000}],
    channelCostSettings:[{platform:'CAFE24',commission_rate:0,payment_fee_rate:0,default_shipping_cost:0,notes:null}]
  });
  const cafe24=center.channels.find(item=>item.platform==='CAFE24');
  assert.equal(cafe24.status,'COST_REQUIRED');
  assert.equal(cafe24.fees,null);
  assert.equal(cafe24.logistics,null);
  assert.equal(cafe24.expected_payout,null);
  assert.match(cafe24.basis,/비용 설정 필요/);
});

test('예상 정산액과 실제 지급액 차이 및 정산 흐름을 계산한다', () => {
  const center=buildUnifiedSettlementCenter({now,coupangSettlements:[
    {order_id:'O1',recognition_date:'2026-08-10',sale_type:'SALE',sale_amount:100000,service_fee:10000,settlement_amount:90000}
  ],coupangSettlementSummaries:[{settlement_date:'2026-08-13',final_amount:88000,status:'DONE'}]});
  const coupang=center.channels.find(item=>item.platform==='COUPANG');
  assert.equal(coupang.expected_payout,90000);
  assert.equal(coupang.actual_payout,88000);
  assert.equal(coupang.payout_variance,-2000);
  assert.equal(center.waterfall.gross_sales,100000);
  assert.equal(center.waterfall.expected_payout,90000);
  assert.equal(center.waterfall.variance,-2000);
});

test('일부 채널만 지급 확인되면 전체 실제 지급으로 확정하지 않고 범위를 남긴다',()=>{
  const center=buildUnifiedSettlementCenter({now,
    naverSettlements:[{
      settle_basis_end_date:'2026-08-10',settle_complete_date:'2026-08-11',
      pay_settle_amount:100000,commission_settle_amount:10000,settle_amount:90000
    }],
    cafe24Orders:[{order_id:'C1',order_date:'2026-08-10',paid_amount:120000}],
    channelCostSettings:[{platform:'CAFE24',commission_rate:0,payment_fee_rate:0,default_shipping_cost:0}]
  });
  assert.equal(center.waterfall.actual_payout,90000);
  assert.equal(center.waterfall.actual_payout_complete,false);
  assert.equal(center.waterfall.actual_channel_count,1);
  assert.equal(center.waterfall.revenue_channel_count,2);
  assert.equal(center.waterfall.actual_payout_coverage,50);
});
