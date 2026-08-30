'use strict';

const text=value=>String(value==null?'':value).trim();
const upper=value=>text(value).toUpperCase();
const finite=value=>typeof value==='number'&&Number.isFinite(value);

function seoulDateKey(value){
  const date=new Date(value);
  if(!value||Number.isNaN(date.getTime()))return null;
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(date);
}

function addDays(date,days){
  const value=new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}

function firstPositive(values=[]){
  const numbers=values.map(value=>value==null?null:Number(value)).filter(finite);
  return numbers.find(value=>value>0)??null;
}

function cancelled(value){
  return /CANCEL|CANCELED|CANCELLED|RETURNED|EXCHANGED/.test(upper(value));
}

function buildMainSalesHistory({
  cafe24Orders=[],naverOrders=[],coupangOrders=[],coupangRgOrders=[],asOf=new Date(),days=7
}={}){
  const end=seoulDateKey(asOf);
  if(!end)return Object.freeze({status:'BLOCKED',daily:Object.freeze([]),channels:Object.freeze([]),totalOrders:0,totalRevenue:null,missingRevenueOrders:0});
  const safeDays=Math.min(31,Math.max(1,Number(days)||7));
  const start=addDays(end,-(safeDays-1));
  const dailyMap=new Map(Array.from({length:safeDays},(_,index)=>{
    const date=addDays(start,index);
    return [date,{date,orders:0,revenue:0}];
  }));
  const channels=new Set();
  const rocketGrowthIds=new Set((coupangRgOrders||[]).map(item=>text(item.order_id)).filter(Boolean));
  let missingRevenueOrders=0;

  const add=({platform,id,at,status,amount})=>{
    if(!id||cancelled(status))return;
    const date=seoulDateKey(at);
    if(!date||date<start||date>end||!dailyMap.has(date))return;
    const revenue=firstPositive(amount);
    const day=dailyMap.get(date);
    day.orders+=1;
    if(revenue==null)missingRevenueOrders+=1;
    else day.revenue+=revenue;
    channels.add(platform);
  };

  for(const order of cafe24Orders||[]){
    const raw=order.raw_data||{};
    const marketId=upper(raw.market_id||raw.order_place_id);
    if(marketId&&!['SELF','MOBILE','CAFE24'].includes(marketId))continue;
    add({
      platform:'CAFE24',id:text(order.order_id),at:order.order_date||raw.order_date||raw.created_date,
      status:order.status||order.payment_status||raw.order_status||raw.status,
      amount:[order.paid_amount,order.order_price,raw.actual_payment_amount,raw.payment_amount,raw.actual_order_amount?.payment_amount,raw.actual_order_amount?.order_price]
    });
  }
  for(const order of naverOrders||[])add({
    platform:'NAVER',id:text(order.order_id||order.product_order_id),at:order.payment_date||order.order_date,
    status:order.status||order.product_order_status,
    amount:[order.paid_amount,order.total_payment_amount,order.raw_data?.paid_amount,order.raw_data?.total_payment_amount]
  });
  for(const order of coupangOrders||[]){
    if(rocketGrowthIds.has(text(order.order_id)))continue;
    add({
      platform:'COUPANG',id:text(order.order_id||order.shipment_box_id),at:order.paid_at||order.ordered_at,
      status:order.status||order.raw_data?.status,
      amount:[order.gross_amount,order.total_amount,order.raw_data?.grossAmount,order.raw_data?.totalAmount]
    });
  }
  for(const order of coupangRgOrders||[])add({
    platform:'COUPANG',id:text(order.order_id),at:order.paid_at||order.ordered_at,
    status:order.status||order.raw_data?.status,
    amount:[order.total_amount,order.gross_amount,order.raw_data?.totalAmount,order.raw_data?.grossAmount]
  });

  const daily=[...dailyMap.values()].map(item=>Object.freeze({...item,revenue:Math.round(item.revenue)}));
  const totalOrders=daily.reduce((sum,item)=>sum+item.orders,0);
  const totalRevenue=daily.reduce((sum,item)=>sum+item.revenue,0);
  const status=missingRevenueOrders>0?'BLOCKED':totalOrders>0&&totalRevenue>0?'READY':'NO_DATA';
  return Object.freeze({
    status,start,end,daily:Object.freeze(daily),channels:Object.freeze([...channels].sort()),
    totalOrders,totalRevenue:totalRevenue>0?Math.round(totalRevenue):null,missingRevenueOrders,
    basis:status==='READY'?'최근 7일 채널별 결제 주문 실제값':'최근 7일 결제 주문 금액 확인 필요'
  });
}

module.exports={buildMainSalesHistory};
