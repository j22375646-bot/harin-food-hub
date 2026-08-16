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
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l|tb|티백|개입|개|세트|팩|포|병)\b/gi, ' ')
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

function cafe24ShippingLabel(items = []) {
  const names = [];
  let quantity = 0;
  for (const item of items || []) {
    const optionNames = optionProductNames(item.option);
    const fallback = compactBaseName(item.name) || '상품';
    names.push(...(optionNames.length ? optionNames : [fallback]));
    const lineQuantity = Math.max(1, number(item.quantity));
    quantity += optionUnitCount(item.option, optionNames) * lineQuantity;
  }
  const uniqueNames = [...new Set(names)].filter(Boolean);
  const total = Math.max(1, quantity);
  const suffix = ` · 총 ${total}개`;
  const available = Math.max(20, 100 - suffix.length);
  const productNames = (uniqueNames.join(' + ') || '상품').slice(0, available).trim();
  return { goodsName:`${productNames}${suffix}`, quantity:total };
}

function shippingLabelForOrder(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (String(order.platform || '').toUpperCase() === 'CAFE24') return cafe24ShippingLabel(items);
  return {
    goodsName:items.map(item => plain(item.name)).filter(Boolean).join(' 외 ').slice(0, 100) || '상품',
    quantity:Math.max(1, items.reduce((sum, item) => sum + Math.max(1, number(item.quantity)), 0))
  };
}

module.exports = { cafe24ShippingLabel, compactBaseName, optionProductNames, optionUnitCount, shippingLabelForOrder };
