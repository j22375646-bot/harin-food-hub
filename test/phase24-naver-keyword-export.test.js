'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildNaverKeywordCsv,naverKeywordSearchUrl}=require('../lib/marketing/naver-keyword-export.js');

test('24-16 exports only the filtered Naver keyword rows and preserves unknown values as blanks',()=>{
  const csv=buildNaverKeywordCsv([
    {
      platform:'NAVER',source:'REGISTERED',keyword:'작두콩차',campaignName:'브랜드 캠페인',adgroupName:'티백 광고그룹',product:'작두콩차 티백',
      currentBid:320,recommendedBid:null,clicks:43,cost:18200,orders:1,roas:309.9,adCategoryState:'ACTIVE',freshness:'2026-08-23'
    },
    {
      platform:'COUPANG',source:'REGISTERED',keyword:'섞이면 안 됨',campaign:'쿠팡 캠페인',currentBid:70,cost:100
    }
  ]);

  assert.equal(csv.charCodeAt(0),0xfeff);
  assert.match(csv,/"네이버","작두콩차","브랜드 캠페인","티백 광고그룹","작두콩차 티백","320","","43","18200","1","309\.9%","운영 중","2026-08-23"/);
  assert.doesNotMatch(csv,/섞이면 안 됨|쿠팡/);
  assert.doesNotMatch(csv,/"0","43","18200"/);
});

test('24-16 protects spreadsheet cells and builds a Naver-only search URL',()=>{
  const csv=buildNaverKeywordCsv([{platform:'NAVER',source:'REGISTERED',keyword:'=HYPERLINK("bad")',campaignName:'+캠페인',adgroupName:'-광고그룹',product:'@상품'}]);

  assert.match(csv,/"'=HYPERLINK\(""bad""\)"/);
  assert.match(csv,/"'\+캠페인"/);
  assert.match(csv,/"'-광고그룹"/);
  assert.match(csv,/"'@상품"/);
  assert.equal(naverKeywordSearchUrl('작두콩차 티백'),'https://search.naver.com/search.naver?query=%EC%9E%91%EB%91%90%EC%BD%A9%EC%B0%A8%20%ED%8B%B0%EB%B0%B1');
  assert.equal(naverKeywordSearchUrl(''),null);
});
