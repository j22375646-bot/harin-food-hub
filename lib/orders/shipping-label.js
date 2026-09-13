'use strict';

const text = value => value == null ? '' : String(value).trim();
const number = value => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function plain(value) {
  return text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|lt|gt);/gi, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactBaseName(value) {
  return plain(value)
    .replace(/^하린식품\s*/i, '')
    .replace(/\([^)]*(?:g|kg|ml|l|tb|티백|개입)[^)]*\)/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l|tb|티백|개입)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulOptionName(value) {
  let candidate = plain(value)
    .replace(/^[^:=]{0,40}[:=]\s*/, '')
    .replace(/[\[\](){}]/g, ' ')
    .replace(/(?:\+|-)?\s*\d[\d,]*\s*원/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l|tb|티백|개입|개|세트|팩|포|병)(?![가-힣A-Za-z])/gi, ' ')
    .replace(/(?:BEST|추천|선택|용량|단품|세트|옵션|골라담기|증정|사은품|무료배송)/gi, ' ')
    .replace(/\b\d+번\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!candidate || candidate.length < 2 || !/[가-힣A-Za-z]/.test(candidate)) return '';
  if (/^(?:기본|없음|해당없음|확인|상품|세트|단품)$/i.test(candidate)) return '';
  return candidate.slice(0, 40);
}

function optionProductNames(option) {
  const source = plain(option);
  if (!source) return [];
  const names = source
    .split(/\s*(?:\/|\||\n|,|·)\s*/)
    .filter(segment => /[:=]/.test(segment))
    .map(meaningfulOptionName)
    .filter(Boolean);
  return [...new Set(names)];
}

function optionUnitCount(option, extractedNames = []) {
  const source = plain(option).replace(/\d+\s*개입/g, '');
  const explicit = [...source.matchAll(/(?:^|[\s/|,])([1-9]\d*)\s*개(?!입)/g)]
    .map(match => Number(match[1]))
    .filter(value => Number.isFinite(value) && value > 0 && value <= 999);
  if (explicit.length) return Math.max(...explicit);
  return Math.max(1, extractedNames.length);
}

function shortBytes(value,limit){let out='';for(const char of plain(value)){if(Buffer.byteLength(out+char,'utf8')>limit)break;out+=char;}return out.trim();}
function shortOption(value){return plain(value).replace(/(?:[+-]?\s*\d[\d,]*\s*원)/g,' ').replace(/\([^)]*총[^)]*\)/g,' ').replace(/(?:BEST|추천|용량\s*선택|단품|세트|옵션|무료배송|선택)/gi,' ').replace(/[\[\]{}=♥❤]/g,' ').replace(/^[\s:/|]+|[\s:/|]+$/g,'').replace(/\s+/g,' ').trim();}
function cafe24ShippingLabel(items = []) {
 const lines=[];let quantity=0;
 for(const item of items||[]){const optionNames=optionProductNames(item.option),name=optionNames.length?optionNames.join(' + '):compactBaseName(item.name)||'상품',option=optionNames.length?'':shortOption(item.option);quantity+=optionUnitCount(item.option,optionNames)*Math.max(1,number(item.quantity));lines.push({name,option});}
 const total=Math.max(1,quantity),prefix=`총 ${total}개 | `,unique=[...new Map(lines.map(v=>[v.name+'|'+v.option,v])).values()],first=unique[0]||{name:'상품',option:''},rest=unique.length>1?` 외 ${unique.length-1}종`:'';
 const option=shortBytes(first.option,24),suffix=(option?' ('+option+')':'')+rest;
 const name=shortBytes(first.name,Math.max(12,100-Buffer.byteLength(prefix+suffix,'utf8')));
 return {goodsName:shortBytes(prefix+name+suffix,100),quantity:total};
}

function shippingLabelForOrder(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (['CAFE24','COUPANG'].includes(String(order.platform || '').toUpperCase())) return cafe24ShippingLabel(items);
  return {
    goodsName:items.map(item => plain(item.name)).filter(Boolean).join(' 외 ').slice(0, 100) || '상품',
    quantity:Math.max(1, items.reduce((sum, item) => sum + Math.max(1, number(item.quantity)), 0))
  };
}

module.exports = { cafe24ShippingLabel, compactBaseName, optionProductNames, optionUnitCount, shippingLabelForOrder, shortBytes, shortOption };
