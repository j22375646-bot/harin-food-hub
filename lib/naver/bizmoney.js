'use strict';

function numberOrNull(value){
  if(value===null||value===undefined||value==='')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}

function kstDateKey(value){
  if(value===null||value===undefined||value==='')return null;
  const compact=String(value).trim();
  if(/^\d{8}$/.test(compact))return `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}`;
  let parsed=value;
  if(/^\d+$/.test(compact)){
    const numeric=Number(compact);
    parsed=numeric<1e12?numeric*1000:numeric;
  }
  const time=new Date(parsed).getTime();
  if(!Number.isFinite(time))return null;
  return new Date(time+9*60*60*1000).toISOString().slice(0,10);
}

function emptyRow(date){
  return {
    date,
    charged_purchased:null,charged_free:null,
    used_purchased:null,used_free:null,
    refunded_purchased:null,refunded_free:null,returned_purchased:null,
    closing_purchased_balance:null,closing_free_balance:null,closing_balance:null,current_balance:null,
    charge_events:0,deduction_events:0,
    updated_at:new Date().toISOString()
  };
}

function add(row,key,value){
  const parsed=numberOrNull(value);
  if(parsed===null)return;
  row[key]=(row[key]??0)+parsed;
}

function addExpense(row,key,value){
  const parsed=numberOrNull(value);
  if(parsed===null)return;
  row[key]=(row[key]??0)+Math.abs(parsed);
}

function totalOrNull(...values){
  const present=values.map(numberOrNull).filter(value=>value!==null);
  return present.length?present.reduce((sum,value)=>sum+value,0):null;
}

function normalizeBizmoneyDaily({charges=[],exhausts=[],periods=[],balance=null,now=new Date()}={}){
  const byDate=new Map();
  const rowFor=value=>{
    const date=kstDateKey(value);
    if(!date)return null;
    if(!byDate.has(date))byDate.set(date,emptyRow(date));
    return byDate.get(date);
  };
  for(const item of Array.isArray(charges)?charges:[]){
    const row=rowFor(item?.statDt);
    if(!row)continue;
    add(row,'charged_purchased',item?.newRefundableAmt);
    add(row,'charged_free',item?.newNonRefundableAmt);
    row.charge_events+=1;
  }
  for(const item of Array.isArray(exhausts)?exhausts:[]){
    const row=rowFor(item?.settleDt);
    if(!row)continue;
    // The exhaust endpoint represents debits with a negative sign, while the
    // period endpoint reports the same expense as a positive magnitude.
    addExpense(row,'used_purchased',item?.useRefundableAmt??item?.useRefundableamt);
    addExpense(row,'used_free',item?.useNonrefundableAmt??item?.useNonRefundableAmt);
    row.deduction_events+=1;
  }
  for(const item of Array.isArray(periods)?periods:[]){
    const row=rowFor(item?.settleDt);
    if(!row)continue;
    if(row.charged_purchased===null)add(row,'charged_purchased',item?.addRefundableAmt);
    if(row.charged_free===null)add(row,'charged_free',item?.addNonRefundableAmt);
    if(row.used_purchased===null)addExpense(row,'used_purchased',item?.useRefundableAmt);
    if(row.used_free===null)addExpense(row,'used_free',item?.useNonRefundableAmt??item?.useNonrefundableAmt);
    row.refunded_purchased=numberOrNull(item?.refundRefundableAmt);
    row.refunded_free=numberOrNull(item?.refundNonRefundableAmt);
    row.returned_purchased=numberOrNull(item?.returnRefundableAmt);
    row.closing_purchased_balance=numberOrNull(item?.refundableAmt);
    row.closing_free_balance=numberOrNull(item?.nonRefundableAmt);
    row.closing_balance=totalOrNull(row.closing_purchased_balance,row.closing_free_balance);
  }
  const currentBalance=numberOrNull(balance?.bizmoney);
  if(currentBalance!==null){
    const latest=[...byDate.values()].sort((left,right)=>right.date.localeCompare(left.date))[0]||rowFor(now);
    latest.current_balance=currentBalance;
    if(latest.closing_balance===null)latest.closing_balance=currentBalance;
  }
  return [...byDate.values()].sort((left,right)=>left.date.localeCompare(right.date));
}

function advertisingUsed(row={}){
  return totalOrNull(row.used_purchased,row.used_free);
}

function advertisingCharged(row={}){
  return totalOrNull(row.charged_purchased,row.charged_free);
}

function normalizeBizmoneyRawSnapshots(rows=[]){
  const successful=(Array.isArray(rows)?rows:[])
    .filter(row=>numberOrNull(row?.http_status)>=200&&numberOrNull(row?.http_status)<300)
    .sort((left,right)=>String(right.created_at||right.requested_at||'').localeCompare(String(left.created_at||left.requested_at||'')));
  const latest=endpoint=>successful.find(row=>String(row.endpoint||'')===endpoint)?.response_json;
  return normalizeBizmoneyDaily({
    balance:latest('/billing/bizmoney')||null,
    charges:latest('/billing/bizmoney/histories/charge')||[],
    exhausts:latest('/billing/bizmoney/histories/exhaust')||[],
    periods:latest('/billing/bizmoney/histories/period')||[]
  });
}

module.exports={normalizeBizmoneyDaily,normalizeBizmoneyRawSnapshots,advertisingUsed,advertisingCharged,kstDateKey,numberOrNull};
