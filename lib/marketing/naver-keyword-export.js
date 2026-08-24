'use strict';

const text=value=>String(value??'').trim();
const numericCell=value=>{
  if(value===null||value===undefined||value==='')return '';
  const parsed=Number(value);
  return Number.isFinite(parsed)?String(parsed):'';
};

function safeSpreadsheetCell(value){
  const raw=value==null?'':String(value);
  return /^[=+\-@]/.test(raw)?`'${raw}`:raw;
}

function csvCell(value){
  return `"${safeSpreadsheetCell(value).replace(/"/g,'""')}"`;
}

function operationalLabel(row={}){
  if(row.adCategoryState==='ACTIVE')return '운영 중';
  if(row.adCategoryState==='INACTIVE')return '사용중지';
  return '확인 필요';
}

function buildNaverKeywordCsv(rows=[]){
  const header=['플랫폼','키워드','캠페인','광고그룹','상품','현재 입찰가','추천 입찰가','클릭','광고비','주문·전환','ROAS','운영 상태','최신 기준'];
  const body=rows
    .filter(row=>row?.platform==='NAVER')
    .map(row=>[
      '네이버',text(row.keyword),text(row.campaignName||row.campaign),text(row.adgroupName),text(row.product),
      numericCell(row.currentBid),numericCell(row.recommendedBid),numericCell(row.clicks),numericCell(row.cost),numericCell(row.orders),
      row.roas===null||row.roas===undefined||row.roas===''?'':`${numericCell(row.roas)}%`,operationalLabel(row),text(row.freshness)
    ]);
  return `\uFEFF${[header,...body].map(row=>row.map(csvCell).join(',')).join('\r\n')}`;
}

function naverKeywordSearchUrl(keyword){
  const query=text(keyword);
  return query?`https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`:null;
}

module.exports={buildNaverKeywordCsv,naverKeywordSearchUrl,safeSpreadsheetCell};
