'use strict';

async function loadOrderPageWindow({query,minimumRows=20,offset=0,snapshot='',requestPage}){
  const params=new URLSearchParams(query);
  const rows=new Map();
  let nextOffset=offset,currentSnapshot=snapshot,result;
  do{
    params.set('offset',String(nextOffset));
    if(currentSnapshot)params.set('snapshot',currentSnapshot);
    result=await requestPage(params);
    for(const order of result.orders||[])rows.set(order.hubOrderId,order);
    currentSnapshot=result.snapshot;
    const previousOffset=nextOffset;
    nextOffset=result.nextOffset;
    if(nextOffset!=null&&nextOffset<=previousOffset)throw new Error('주문 페이지 진행 위치를 확인하지 못했습니다. 다시 시도하세요.');
  }while(nextOffset!=null&&rows.size<minimumRows);
  return {...result,orders:[...rows.values()]};
}

function revalidationDepth(previousQuery,currentQuery,loadedCount){
  return previousQuery===currentQuery?Math.max(20,Number(loadedCount)||20):20;
}

module.exports={loadOrderPageWindow,revalidationDepth};
