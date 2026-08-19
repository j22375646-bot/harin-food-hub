'use strict';

const PAGE_SIZE=8;
const COST_FIELDS=['unit_cost','packaging_cost','other_unit_cost'];

function hasCostValue(value){
  return value!==null&&value!==undefined&&value!=='';
}

function costStatus(row={}){
  const completed=COST_FIELDS.filter(field=>hasCostValue(row[field])).length;
  return {
    completed,
    total:COST_FIELDS.length,
    ready:completed===COST_FIELDS.length,
    label:completed===COST_FIELDS.length?'입력 완료':`${COST_FIELDS.length-completed}개 확인 필요`
  };
}

function filterCostProducts(products=[],rows={},search=''){
  const query=String(search||'').trim().toLocaleLowerCase('ko-KR');
  const filtered=query
    ?products.filter(product=>`${product.name||''} ${product.id||''}`.toLocaleLowerCase('ko-KR').includes(query))
    :products;
  return [...filtered].sort((left,right)=>{
    const leftReady=costStatus(rows[left.id]).ready;
    const rightReady=costStatus(rows[right.id]).ready;
    if(leftReady!==rightReady)return leftReady?1:-1;
    return String(left.name||'').localeCompare(String(right.name||''),'ko-KR');
  });
}

function paginateCostProducts(products=[],page=1,pageSize=PAGE_SIZE){
  const safePageSize=Math.max(1,Number(pageSize)||PAGE_SIZE);
  const totalPages=Math.max(1,Math.ceil(products.length/safePageSize));
  const currentPage=Math.min(Math.max(1,Number(page)||1),totalPages);
  const start=(currentPage-1)*safePageSize;
  return {
    items:products.slice(start,start+safePageSize),
    currentPage,
    totalPages,
    total:products.length,
    start:products.length?start+1:0,
    end:Math.min(start+safePageSize,products.length)
  };
}

module.exports={PAGE_SIZE,COST_FIELDS,hasCostValue,costStatus,filterCostProducts,paginateCostProducts};
