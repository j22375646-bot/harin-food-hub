'use strict';

const num = value => Number(value || 0);

function campaignCategory(type, name = '') {
  const value = `${type || ''} ${name || ''}`.toUpperCase();
  if (value.includes('ADVOOST') && value.includes('SHOP')) return 'ADVOOST_SHOPPING';
  if (value.includes('ADVOOST') && value.includes('BOOST')) return 'ADVOOST_BOOST_UP';
  if (value.includes('ADVOOST')) return 'ADVOOST_SEARCH';
  if (value.includes('SHOPPING') || value.includes('SHOP')) return 'SHOPPING_SEARCH';
  if (value.includes('POWERLINK') || value.includes('WEB_SITE') || value.includes('WEBSITE')) return 'POWERLINK';
  if (value.includes('BRAND')) return 'BRAND';
  if (value.includes('DISPLAY') || value.includes('GFA')) return 'PERFORMANCE_DISPLAY';
  if (value.includes('AI') || value.includes('BRIEFING')) return 'AI_AD';
  return 'OTHER';
}

function sampleConfidence({ clicks = 0, conversions = 0, days = 0 } = {}) {
  const c = num(clicks), v = num(conversions), d = num(days);
  if (v >= 30 || (c >= 100 && d >= 7)) return { level: 'HIGH', label: '높음', reason: '의사결정에 충분한 표본' };
  if (v >= 10 || c >= 30) return { level: 'MEDIUM', label: '보통', reason: '방향성 판단은 가능하나 추가 관찰 권장' };
  return { level: 'LOW', label: '낮음', reason: '표본이 적어 중단·증액 판단 보류' };
}

function summarizeCampaigns(campaigns = [], days = 0) {
  const categories = new Map();
  const detailed = campaigns.map(item => {
    const category = campaignCategory(item.type, item.name);
    const confidence = sampleConfidence({ clicks: item.clicks, conversions: item.conversions, days });
    const learning = category === 'ADVOOST_SHOPPING'
      ? (num(item.conversions) >= 30
        ? { status: 'READY', label: '학습 가능', guidance: '성과 기준으로 예산 판단 가능' }
        : { status: 'LIMITED', label: '학습 데이터 부족', guidance: '최근 7일 구매완료 30건 미만이면 증액·중단 판단을 보류하세요.' })
      : null;
    const row = { ...item, category, confidence, learning };
    const total = categories.get(category) || { category, campaigns: 0, impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 };
    total.campaigns += 1;
    for (const key of ['impressions', 'clicks', 'cost', 'conversions', 'revenue']) total[key] += num(item[key]);
    categories.set(category, total);
    return row;
  });
  return {
    campaigns: detailed,
    categories: [...categories.values()].map(item => ({
      ...item,
      roas: item.cost ? item.revenue / item.cost * 100 : 0,
      ctr: item.impressions ? item.clicks / item.impressions * 100 : 0,
      confidence: sampleConfidence({ clicks: item.clicks, conversions: item.conversions, days })
    })).sort((a, b) => b.cost - a.cost)
  };
}

function periodDays(start, end) {
  return Math.max(1, Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1);
}

function dataCoverage({ start, end, trafficDates = [], adDates = [], minimumRate = 90 }) {
  const expected = periodDays(start, end);
  const required = Math.min(100, Math.max(1, Number(minimumRate) || 90));
  const metric = dates => {
    const actual = new Set((dates || []).filter(Boolean)).size;
    const rate = Math.min(100, actual / expected * 100);
    return { expected_days: expected, actual_days: actual, rate, required_rate: required, status: rate >= required ? 'OK' : rate >= required * (2 / 3) ? 'PARTIAL' : 'LOW' };
  };
  return { cafe24_traffic: metric(trafficDates), naver_ads: metric(adDates) };
}

function profitability({ cafe24 = {}, naver = {} } = {}) {
  const grossSales = num(cafe24.gross_revenue ?? cafe24.revenue);
  const refunds = num(cafe24.refunds);
  const cancellations = num(cafe24.cancellations);
  const netSales = num(cafe24.net_revenue ?? Math.max(0, grossSales - refunds - cancellations));
  const adSpend = num(naver.ad_spend);
  const attributedRevenue = num(naver.revenue);
  return {
    gross_sales: grossSales,
    refunds,
    cancellations,
    net_sales: netSales,
    ad_spend: adSpend,
    attributed_revenue: attributedRevenue,
    paid_roas: adSpend ? attributedRevenue / adSpend * 100 : null,
    mer: adSpend ? netSales / adSpend * 100 : null,
    contribution_profit: null,
    contribution_profit_status: 'COST_DATA_REQUIRED',
    note: 'Paid ROAS는 네이버 귀속매출, MER은 Cafe24 순매출을 같은 광고비로 나눈 값입니다. 원가·수수료·택배비 등록 전에는 공헌이익을 계산하지 않습니다.'
  };
}

function comparisonGuard(events = []) {
  const blocking = events.filter(item => item.affects_comparison !== false);
  return {
    safe: blocking.length === 0,
    event_count: blocking.length,
    message: blocking.length
      ? `비교 기간에 ${blocking.length}건의 플랫폼·운영 변경이 있어 단순 증감률만으로 결론 내리면 안 됩니다.`
      : '비교를 왜곡할 주요 변경 이벤트가 확인되지 않았습니다.'
  };
}

module.exports = { campaignCategory, sampleConfidence, summarizeCampaigns, periodDays, dataCoverage, profitability, comparisonGuard };
