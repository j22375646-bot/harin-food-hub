'use strict';

async function saveProductAnalysisReport({fetchImpl=fetch,router,productId,periodDays}={}){
  const response=await fetchImpl('/api/product-analysis',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({product_id:productId,period_days:periodDays})
  });
  const payload=await response.json();
  if(!response.ok||!payload.ok)throw new Error(payload.error||'상품 분석을 만들지 못했습니다.');
  router?.refresh?.();
  return payload.report;
}

module.exports={saveProductAnalysisReport};
