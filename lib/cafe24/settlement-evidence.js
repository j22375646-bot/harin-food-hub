'use strict';

const {isCafe24StorefrontOrder}=require('./order-origin.js');
const {seoulDateKey}=require('../analytics/financial-date.js');

const text=value=>String(value==null?'':value).trim();
const upper=value=>text(value).toUpperCase();
const numberOrNull=value=>{
  if(value==null||value==='')return null;
  const parsed=Number(String(value).replace(/,/g,''));
  return Number.isFinite(parsed)&&parsed>=0?parsed:null;
};

function orderPaymentEvidence(order={}){
  if(!isCafe24StorefrontOrder(order))return {
    eligible:false,amount:null,basis:null,issue:'MIRRORED_MARKETPLACE'
  };
  const raw=order.raw_data&&typeof order.raw_data==='object'?order.raw_data:{};
  const paymentStatus=upper(order.payment_status||raw.payment_status);
  const paidFlag=upper(raw.paid);
  if(paidFlag==='F'||['F','UNPAID','BEFORE_PAYMENT','N00','N02'].includes(paymentStatus))return {
    eligible:false,amount:null,basis:null,issue:'EXPLICITLY_UNPAID'
  };
  if(paidFlag==='M'){
    const partialCandidates=[
      ['RAW_ACTUAL_PAYMENT_AMOUNT',raw.actual_payment_amount],
      ['RAW_PAID_AMOUNT',raw.paid_amount]
    ].map(([basis,value])=>({basis,amount:numberOrNull(value)}));
    const partialPayment=partialCandidates.find(item=>item.amount>0);
    if(partialPayment)return {eligible:true,...partialPayment,issue:'PARTIAL_PAYMENT'};
    return {eligible:false,amount:null,basis:null,issue:'PARTIAL_PAYMENT_AMOUNT_MISSING'};
  }
  const candidates=[
    ['PAID_AMOUNT',order.paid_amount],
    ['RAW_ACTUAL_PAYMENT_AMOUNT',raw.actual_payment_amount],
    ['RAW_PAYMENT_AMOUNT',raw.payment_amount],
    ['RAW_ACTUAL_ORDER_PAYMENT_AMOUNT',raw.actual_order_amount?.payment_amount]
  ];
  const normalizedCandidates=candidates.map(([basis,value])=>({basis,amount:numberOrNull(value)}));
  const payment=normalizedCandidates.find(item=>item.amount>0)
    ||normalizedCandidates.find(item=>item.amount===0);
  if(payment){
    const confirmed=paidFlag==='T'||['P','A','T','PAID','PAYED'].includes(paymentStatus)||Boolean(text(raw.payment_date||order.payment_date));
    return {eligible:true,...payment,issue:confirmed?null:'PAYMENT_STATUS_UNCERTAIN'};
  }
  return {eligible:false,amount:null,basis:null,issue:'PAYMENT_AMOUNT_MISSING'};
}

function settlementPaymentDate(order={}){
  const raw=order.raw_data&&typeof order.raw_data==='object'?order.raw_data:{};
  const candidates=[
    ['RAW_PAYMENT_DATE',raw.payment_date],
    ['PAYMENT_DATE',order.payment_date]
  ];
  let suppliedPaymentDate=false;
  for(const [basis,value] of candidates){
    if(!text(value))continue;
    suppliedPaymentDate=true;
    const date=seoulDateKey(value);
    if(date)return {date,basis,issue:null};
  }
  const orderDate=seoulDateKey(order.order_date);
  if(orderDate)return {
    date:orderDate,
    basis:'ORDER_DATE_ESTIMATE',
    issue:suppliedPaymentDate?'PAYMENT_DATE_INVALID':'PAYMENT_DATE_MISSING'
  };
  return {date:null,basis:null,issue:'SETTLEMENT_DATE_MISSING'};
}

function periodDateKeys(periodStart,periodEnd){
  const start=seoulDateKey(periodStart);
  const end=seoulDateKey(periodEnd);
  if(!start||!end||start>end)throw new TypeError('Cafe24 settlement period must have valid ascending dates.');
  const result=[];
  for(let cursor=Date.parse(`${start}T00:00:00Z`),last=Date.parse(`${end}T00:00:00Z`);cursor<=last;cursor+=86400000){
    result.push(new Date(cursor).toISOString().slice(0,10));
  }
  return result;
}

function completeSalesDay(row={}){
  return upper(row.source_status)==='OK'
    &&[row.payment_amount,row.refund_amount,row.sales_count].every(value=>numberOrNull(value)!=null);
}

function summarizeSettlementDayEvidence({orders=[],salesDaily=[],periodStart,periodEnd}={}){
  const expectedDates=periodDateKeys(periodStart,periodEnd);
  const expectedSet=new Set(expectedDates);
  const apiByDate=new Map();
  for(const row of salesDaily||[]){
    const date=seoulDateKey(row?.date);
    if(expectedSet.has(date)&&completeSalesDay(row))apiByDate.set(date,row);
  }
  const ordersByDate=new Map();
  for(const order of orders||[]){
    const dateEvidence=settlementPaymentDate(order);
    const date=dateEvidence.date;
    if(!expectedSet.has(date))continue;
    const evidence=orderPaymentEvidence(order);
    if(!evidence.eligible)continue;
    if(!ordersByDate.has(date))ordersByDate.set(date,[]);
    ordersByDate.get(date).push({...evidence,dateEvidence});
  }
  const days=expectedDates.map(date=>{
    const api=apiByDate.get(date);
    if(api)return {
      date,
      source:'SALES_REPORT',
      source_status:'OK',
      payment_amount:numberOrNull(api.payment_amount),
      refund_amount:numberOrNull(api.refund_amount),
      sales_count:numberOrNull(api.sales_count),
      payment_evidence_status:'API_COMPLETE'
    };
    const orderEvidence=ordersByDate.get(date)||[];
    if(orderEvidence.length){
      const uncertain=orderEvidence.some(item=>item.issue!=null||item.dateEvidence.issue!=null);
      return {
        date,
        source:'ORDER_ESTIMATE',
        source_status:uncertain?'UNCERTAIN':'ESTIMATED',
        payment_amount:orderEvidence.reduce((sum,item)=>sum+item.amount,0),
        refund_amount:null,
        sales_count:orderEvidence.length,
        payment_evidence_status:uncertain?'PARTIAL':'CONFIRMED_PAID'
      };
    }
    return {
      date,
      source:'MISSING',
      source_status:'NO_DATA',
      payment_amount:null,
      refund_amount:null,
      sales_count:null,
      payment_evidence_status:'MISSING'
    };
  });
  return {
    period:{start:expectedDates[0],end:expectedDates.at(-1),timezone:'Asia/Seoul'},
    days,
    coverage:{
      expected_days:days.length,
      api_days:days.filter(day=>day.source==='SALES_REPORT').length,
      estimated_days:days.filter(day=>day.source==='ORDER_ESTIMATE').length,
      missing_days:days.filter(day=>day.source==='MISSING').length,
      uncertain_days:days.filter(day=>day.source_status==='UNCERTAIN').length
    },
    actual_payout:null
  };
}

module.exports={orderPaymentEvidence,settlementPaymentDate,summarizeSettlementDayEvidence};
