'use strict';

const BRAND_PHRASES = [
  '하린식품', 'haccp', '해썹인증', '해썹', '친환경무농약인증', '무농약인증',
  '국내산', '국산', '공식몰', '단독', '최신본', '전통', '수제', '건강식품'
];
const GENERIC_WORDS = new Set([
  '상품', '제품', '메인', '기타', '라인', '세트', '검색', '추천', '플러스', '키워드',
  '모바일', 'pc', 'mo', '광고', '그룹', '티백', 'tb', 'ea', 'tea', '차'
]);

function normalizeUnits(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/티\s*백|tea\s*bag/gi, 'tb')
    .replace(/\bea\b/gi, '개')
    .replace(/([0-9])\s*[x×]\s*([0-9])/gi, '$1x$2')
    .replace(/킬로그램/gi, 'kg')
    .replace(/그램/gi, 'g')
    .replace(/밀리리터/gi, 'ml')
    .replace(/리터/gi, 'l');
}

function stripChannelBundleSuffix(value) {
  return String(value || '').replace(/(?:,|\s)\s*\d+\s*(?:개|입|포|병|세트|묶음)\s*$/i, '').trim();
}

function normalizeProductText(value) {
  let text = normalizeUnits(String(value || '').normalize('NFKC').toLowerCase());
  for (const phrase of BRAND_PHRASES) text = text.replaceAll(phrase, ' ');
  return text
    .replace(/\b(mo|pc)\b/gi, ' ')
    .replace(/[🎁⭐🔥🫘🫛]/gu, ' ')
    .replace(/[^0-9a-z가-힣.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value) {
  return normalizeProductText(value).replace(/\s+/g, '');
}

function nameCompact(value) {
  return normalizeProductText(value)
    .replace(/\d+(?:\.\d+)?\s*(?:kg|g|ml|l|tb|개|입|포|병)?/gi, ' ')
    .split(/\s+/)
    .filter(word => word && !GENERIC_WORDS.has(word))
    .join('');
}

function wordTokens(value) {
  return normalizeProductText(value)
    .split(/\s+/)
    .map(word => word.replace(/^\d+[.]?/, ''))
    .filter(word => word.length >= 2 && !/\d/.test(word) && !GENERIC_WORDS.has(word));
}

function bigrams(value) {
  const text = String(value || '');
  if (text.length < 2) return text ? [text] : [];
  const rows = [];
  for (let index = 0; index < text.length - 1; index += 1) rows.push(text.slice(index, index + 2));
  return rows;
}

function diceCoefficient(left, right) {
  const a = bigrams(left), b = bigrams(right);
  if (!a.length || !b.length) return left === right && left ? 1 : 0;
  const counts = new Map();
  for (const item of a) counts.set(item, (counts.get(item) || 0) + 1);
  let intersection = 0;
  for (const item of b) {
    const count = counts.get(item) || 0;
    if (!count) continue;
    intersection += 1;
    counts.set(item, count - 1);
  }
  return (2 * intersection) / (a.length + b.length);
}

function tokenOverlap(left, right) {
  const a = new Set(wordTokens(left)), b = new Set(wordTokens(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

function extractSpecs(value) {
  const text = normalizeUnits(String(value || '').normalize('NFKC').toLowerCase());
  const rows = [];
  const pattern = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|tb|개|입|포|병)/gi;
  for (const match of text.matchAll(pattern)) {
    let amount = Number(match[1]), unit = match[2].toLowerCase();
    if (unit === 'kg') { amount *= 1000; unit = 'g'; }
    if (unit === 'l') { amount *= 1000; unit = 'ml'; }
    rows.push(`${amount}${unit}`);
  }
  return [...new Set(rows)];
}

function specCompatibility(left, right) {
  const a = extractSpecs(left), b = extractSpecs(right);
  if (!a.length || !b.length) return 0.5;
  const normalized = item => item.replace(/(tb|개|입|포|병)$/i, 'count');
  const normalizedA = a.map(normalized), normalizedB = b.map(normalized);
  const common = normalizedA.filter(item => normalizedB.includes(item)).length;
  const coverage = common / Math.min(a.length, b.length);
  const aCounts = normalizedA.filter(item => /count$/.test(item));
  const bCounts = normalizedB.filter(item => /count$/.test(item));
  if (aCounts.length && bCounts.length && !aCounts.some(item => bCounts.includes(item))) return Math.min(coverage, 0.15);
  return coverage;
}

function priceSimilarity(left, right) {
  const a = Number(left), b = Number(right);
  if (!(a > 0) || !(b > 0)) return 0.5;
  return Math.max(0, 1 - Math.abs(a - b) / Math.max(a, b));
}

function scoreProductMatch(master, source) {
  const sourceNameForMatch = stripChannelBundleSuffix(source.name);
  const masterText = compact(master.name), sourceText = compact(sourceNameForMatch);
  const masterName = nameCompact(master.name), sourceName = nameCompact(sourceNameForMatch);
  if (!masterName || !sourceName) return { score: 0, reasons: ['상품명 정보 부족'] };
  if (masterText === sourceText) return { score: 0.995, reasons: ['정규화 상품명 일치'] };

  const dice = diceCoefficient(masterName, sourceName);
  const masterTokens = wordTokens(master.name);
  const sourceTokens = new Set(wordTokens(sourceNameForMatch));
  const masterTokensCovered = masterTokens.length > 0 && masterTokens.every(token => sourceTokens.has(token));
  const contained = Math.min(masterName.length, sourceName.length) >= 3 && (masterName.includes(sourceName) || sourceName.includes(masterName) || masterTokensCovered) ? 1 : 0;
  const tokens = tokenOverlap(master.name, sourceNameForMatch);
  const specs = specCompatibility(master.name, sourceNameForMatch);
  const price = priceSimilarity(master.selling_price, source.selling_price);
  let score = (dice * 0.46) + (contained * 0.22) + (tokens * 0.14) + (specs * 0.12) + (price * 0.06);

  const masterCounts = extractSpecs(master.name).filter(item => /(?:tb|개|입|포|병)$/i.test(item));
  const sourceCounts = extractSpecs(sourceNameForMatch).filter(item => /(?:tb|개|입|포|병)$/i.test(item));
  const masterMeasures = extractSpecs(master.name).filter(item => /(?:g|ml)$/i.test(item));
  const sourceMeasures = extractSpecs(sourceNameForMatch).filter(item => /(?:g|ml)$/i.test(item));
  const masterCountAmounts = masterCounts.map(item => Number(item.match(/^\d+(?:\.\d+)?/)?.[0])).filter(Number.isFinite);
  const sourceCountAmounts = sourceCounts.map(item => Number(item.match(/^\d+(?:\.\d+)?/)?.[0])).filter(Number.isFinite);
  if (masterCounts.length && sourceCounts.length && !masterCountAmounts.some(item => sourceCountAmounts.includes(item))) score *= 0.62;
  else if (masterCounts.length !== sourceCounts.length && (masterCounts.length || sourceCounts.length)) score *= 0.8;
  if (masterMeasures.length && sourceMeasures.length && !masterMeasures.some(item => sourceMeasures.includes(item))) score *= 0.65;
  if (Math.min(masterName.length, sourceName.length) < 3) score *= 0.55;

  const reasons = [];
  if (contained) reasons.push('핵심 상품명 포함');
  if (dice >= 0.72) reasons.push('상품명 유사도 높음');
  if (specs >= 0.95) reasons.push('중량·수량 규격 일치');
  else if (specs < 0.35) reasons.push('규격 확인 필요');
  if (price >= 0.9 && Number(master.selling_price) > 0 && Number(source.selling_price) > 0) reasons.push('판매가 유사');
  if (!reasons.length) reasons.push('상품명 일부 유사');
  return { score: Math.max(0, Math.min(0.99, Number(score.toFixed(4)))), reasons };
}

function rankCandidates(masterProducts, source, limit = 3) {
  return masterProducts
    .map(master => ({ master, ...scoreProductMatch(master, source) }))
    .filter(item => item.score >= 0.38)
    .sort((left, right) => right.score - left.score || String(left.master.name).localeCompare(String(right.master.name), 'ko'))
    .slice(0, limit);
}

function buildMappingCandidates({ masterProducts = [], sources = [], existingLinks = [], rejectedPairs = [] }) {
  const linked = new Set(existingLinks.filter(item => item.master_product_id).map(item => `${item.platform}:${item.external_product_id}`));
  const rejected = new Set(rejectedPairs);
  return sources
    .filter(source => !linked.has(`${source.platform}:${source.external_product_id}`))
    .map(source => {
      const suggested = rankCandidates(masterProducts, source, 5);
      const ranked = suggested
        .filter(item => !rejected.has(`${source.platform}:${source.external_product_id}:${item.master.id}`))
        .slice(0, 3);
      if (suggested.length && !ranked.length) return null;
      const first = ranked[0], second = ranked[1];
      const margin = first ? first.score - (second?.score || 0) : 0;
      return {
        ...source,
        candidates: ranked.map(item => ({ master_product_id:item.master.id, master_name:item.master.name, score:item.score, confidence:Math.round(item.score * 100), reasons:item.reasons })),
        auto_eligible: Boolean(first && first.score >= 0.9 && margin >= 0.08),
        confidence_margin: Number(margin.toFixed(4))
      };
    })
    .filter(Boolean)
    .sort((left, right) => Number(right.auto_eligible) - Number(left.auto_eligible) || (right.candidates[0]?.score || 0) - (left.candidates[0]?.score || 0));
}

module.exports = {
  normalizeProductText,
  stripChannelBundleSuffix,
  compact,
  extractSpecs,
  diceCoefficient,
  scoreProductMatch,
  rankCandidates,
  buildMappingCandidates
};
