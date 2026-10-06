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
    .replace(/\d+(?:\.\d+)?\s*(?:kg|g|ml|l|tb|티백|개입)(?![A-Za-z가-힣])/gi, ' ')
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

// The option total describes one purchased set; row.quantity is the number of sets.
function countMatch(value, pattern) {
 const match=plain(value).match(pattern);return match?Number(match[1].replace(/,/g,'')):0;
}
function packCount(option){
 const source=plain(option).replace(/\(?총\s*[\d,]+\s*(?:티백|TB|개)\)?/gi,'');
 return countMatch(option,/총\s*([\d,]+)\s*개/)||countMatch(source,/(?:^|[\s/|])([1-9]\d*)\s*개(?!입)/)||1;
}
function displayName(value){
 return compactBaseName(value)
  .replace(/(?:하린식품|해썹\s*인증|HACCP\s*인증|HACCP)/gi,' ')
  .replace(/사은품/g,' ').replace(/(?:^|\s)햇\s*/g,' ')
  .replace(/작두콩열매볶은\s*작두콩\s*깍지차/g,'작두콩깍지차')
  .replace(/작두콩\s+깍지차/g,'작두콩깍지차')
  .replace(/\s+/g,' ').trim()||'상품';
}
function weightOf(value){
 // Parentheses typically contain per-teabag composition, not a pack weight.
 const source=plain(value).replace(/\([^)]*\)/g,'');
 const match=source.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
 return match?match[1]+match[2].toLowerCase():'';
}
function cafe24ShippingLabel(items = []) {
 const groups=new Map();let quantity=0;
 function add(name,unit,total,gift,weight='',variant=''){
  const key=JSON.stringify([name,unit,gift,weight,variant]);
  const group=groups.get(key)||{name,unit,total:0,gift,weight,variant};group.total+=total;groups.set(key,group);
 }
 for(const item of items||[]){
  const ordered=Math.max(1,number(item.quantity)),option=plain(item.option),raw=plain(item.name);
  const gift=/사은품/.test(raw),name=displayName(raw);
  const picks=[...option.matchAll(/\d+번\s*선택\s*[:=]\s*([^/|]+)/g)].map(m=>plain(m[1])).filter(Boolean);
  if(picks.length){for(const pick of picks)add(displayName(pick),'개',ordered,gift,weightOf(pick));quantity+=picks.length*ordered;continue;}
  const packs=packCount(option);quantity+=packs*ordered;
  const teaTotal=countMatch(option,/총\s*([\d,]+)\s*(?:티백|TB)/i);
  const optionTea=countMatch(option,/(\d+)\s*(?:티백|TB)(?![A-Za-z])/i);
  const titleTea=weightOf(option)?0:countMatch(raw,/(\d+)\s*(?:티백|TB)(?![A-Za-z])/i);
  if(teaTotal||optionTea||titleTea){
   const perBag=raw.match(/(\d+(?:\.\d+)?)\s*g\s*[x×]\s*\d+\s*(?:TB|티백)/i)?.[1]||'';
   add(name,'티백',(teaTotal||(optionTea||titleTea)*packs)*ordered,gift,'',perBag);
  }else{
   const weight=weightOf(option)||weightOf(raw);
   // Preserve unknown textual variants rather than silently merging flavours.
   const variant=optionProductNames(option).filter(v=>!/[\[\]]|단품|세트|용량/.test(v)&&!/^\W*$/.test(v)).join(' + ');
   add(name,'개',packs*ordered,gift,weight,variant&&variant!==name?variant:'');
  }
 }
 const goodsName=[...groups.values()].map(g=>{
  const base=(g.gift?'사은품 ':'')+g.name+(g.weight?' '+g.weight:'')+(g.unit==='개'&&g.variant?' '+g.variant:'');
  return base+(g.gift&&g.total===1&&g.unit==='개'?'':`(총 ${g.total}${g.unit})`);
 }).join(', ')||'상품';
 // Never drop trailing products/gifts to make a superficially valid label.
 if([...goodsName].length>400)throw Object.assign(Error('송장 품명이 너무 깁니다. 제품명을 줄여 확인해 주세요.'),{code:'SHIPPING_LABEL_TOO_LONG',status:400});
 return {goodsName,quantity:Math.max(1,quantity)};
}
function shippingLabelForOrder(order = {}) {
 return cafe24ShippingLabel(Array.isArray(order.items)?order.items:[]);
}

module.exports = { cafe24ShippingLabel, compactBaseName, optionProductNames, optionUnitCount, shippingLabelForOrder, shortBytes, shortOption };
