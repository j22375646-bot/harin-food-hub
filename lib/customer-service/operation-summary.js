'use strict';

const {caseCompleted}=require('./unified-center.js');

const text=value=>value==null?'':String(value);

// Match the CS center's provider-specific completion rules without loading
// inquiry bodies, decrypting channel content, or combining provider storage.
function buildCustomerServiceOperationSummary({
  customerServiceRows=[],coupangInquiries=[],coupangReturns=[],coupangExchanges=[],available=true
}={}){
  const active=[];
  for(const item of coupangInquiries||[]){
    if(item.answered)continue;
    active.push({id:`COUPANG:INQUIRY:${item.inquiry_key||item.inquiry_id}`,platform:'COUPANG',kind:'INQUIRY'});
  }
  for(const [items,fallback,idKey] of [[coupangReturns,'RETURN','receipt_id'],[coupangExchanges,'EXCHANGE','exchange_id']]){
    for(const item of items||[]){
      if(caseCompleted(item))continue;
      const kind=/CANCEL|RELEASE_STOP/.test(`${item.cancel_type||''} ${item.status||''}`.toUpperCase())?'CANCEL':fallback;
      active.push({id:`COUPANG:${kind}:${text(item[idKey])}`,platform:'COUPANG',kind});
    }
  }
  for(const item of customerServiceRows||[]){
    if(item.completed)continue;
    const platform=text(item.platform).toUpperCase();
    const kind=text(item.kind).toUpperCase();
    active.push({id:item.source_key||`${platform}:${kind}:${text(item.source_id||item.sourceId||item.id)}`,platform,kind});
  }
  return {
    active,
    summary:{
      active:available?active.length:null,
      unanswered:available?active.filter(item=>item.kind==='INQUIRY').length:null,
      claims:available?active.filter(item=>item.kind!=='INQUIRY').length:null
    }
  };
}

module.exports={buildCustomerServiceOperationSummary};
