'use strict';

const number = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const RULES = [
  { key:'cafe24_revenue', platform:'CAFE24', metric:'REVENUE', label:'Cafe24 매출', direction:'DOWN', warning:20, critical:35, minimumPrevious:10000, action:'상품·유입·프로모션별 매출 하락 원인을 확인하세요.' },
  { key:'cafe24_orders', platform:'CAFE24', metric:'ORDERS', label:'Cafe24 주문', direction:'DOWN', warning:20, critical:35, minimumPrevious:3, action:'주문 퍼널과 품절·결제 오류를 확인하세요.' },
  { key:'cafe24_visitors', platform:'CAFE24', metric:'VISITORS', label:'Cafe24 방문', direction:'DOWN', warning:25, critical:40, minimumPrevious:20, requiresCoverage:'cafe24_traffic', action:'유입경로별 감소와 광고 노출 변화를 확인하세요.' },
  { key:'cafe24_conversion', platform:'CAFE24', metric:'CVR', label:'Cafe24 구매전환율', direction:'DOWN', warning:20, critical:35, minimumPrevious:0.1, requiresCoverage:'cafe24_traffic', action:'상품 상세·장바구니·결제 구간을 점검하세요.' },
  { key:'naver_spend', platform:'NAVER', metric:'AD_SPEND', label:'네이버 광고비', direction:'UP', warning:25, critical:45, minimumPrevious:5000, requiresCoverage:'naver_ads', pairedGrowthKey:'naver_revenue', action:'매출 증가 없이 광고비만 늘어난 캠페인이 있는지 확인하세요.' },
  { key:'naver_cpc', platform:'NAVER', metric:'CPC', label:'네이버 CPC', direction:'UP', warning:20, critical:35, minimumPrevious:10, requiresCoverage:'naver_ads', action:'입찰 경쟁 상승 캠페인과 목표 CPC 초과 항목을 확인하세요.' },
  { key:'naver_cvr', platform:'NAVER', metric:'CVR', label:'네이버 CVR', direction:'DOWN', warning:20, critical:35, minimumPrevious:0.1, requiresCoverage:'naver_ads', action:'키워드·소재·랜딩별 전환 하락 원인을 확인하세요.' },
  { key:'naver_cpa', platform:'NAVER', metric:'CPA', label:'네이버 CPA', direction:'UP', warning:25, critical:50, minimumPrevious:100, requiresCoverage:'naver_ads', action:'고비용 무전환 캠페인과 키워드 예산을 재검토하세요.' },
  { key:'naver_roas', platform:'NAVER', metric:'ROAS', label:'네이버 Paid ROAS', direction:'DOWN', warning:20, critical:35, minimumPrevious:1, requiresCoverage:'naver_ads', action:'광고비 대비 전환매출이 감소한 캠페인을 확인하세요.' },
  { key:'coupang_sales', platform:'COUPANG', metric:'REVENUE', label:'쿠팡 매출', direction:'DOWN', warning:20, critical:35, minimumPrevious:10000, action:'로켓그로스·판매자배송 상품별 매출과 품절 여부를 확인하세요.' },
  { key:'coupang_orders', platform:'COUPANG', metric:'ORDERS', label:'쿠팡 주문', direction:'DOWN', warning:20, critical:35, minimumPrevious:3, action:'상품별 주문 감소와 판매가능 재고를 확인하세요.' },
  { key:'coupang_ad_spend', platform:'COUPANG', metric:'AD_SPEND', label:'쿠팡 광고비', direction:'UP', warning:30, critical:50, minimumPrevious:5000, pairedGrowthKey:'coupang_ad_revenue', action:'광고매출이 동반 상승하지 않은 캠페인을 확인하세요.' },
  { key:'coupang_ad_cpc', platform:'COUPANG', metric:'CPC', label:'쿠팡 CPC', direction:'UP', warning:20, critical:35, minimumPrevious:10, action:'광고상품·캠페인별 클릭비용 상승 원인을 확인하세요.' },
  { key:'coupang_ad_cvr', platform:'COUPANG', metric:'CVR', label:'쿠팡 광고 CVR', direction:'DOWN', warning:20, critical:35, minimumPrevious:0.1, action:'광고상품의 가격·리뷰·상세페이지 전환 하락을 확인하세요.' },
  { key:'coupang_ad_cpa', platform:'COUPANG', metric:'CPA', label:'쿠팡 광고 CPA', direction:'UP', warning:25, critical:50, minimumPrevious:100, action:'주문당 광고비가 높은 캠페인 예산을 재검토하세요.' }
];

function coverageReady(coverage, key) {
  if (!key) return true;
  return coverage?.[key]?.status === 'OK';
}

function configuredLimit(rule, thresholds = {}) {
  const prefix = rule.direction === 'DOWN' ? 'anomaly_decrease' : 'anomaly_increase';
  const warning = Number(thresholds[`${prefix}_warning_percent`]);
  const critical = Number(thresholds[`${prefix}_critical_percent`]);
  return {
    warning: Number.isFinite(warning) && warning > 0 ? warning : rule.warning,
    critical: Number.isFinite(critical) && critical > 0 ? critical : rule.critical
  };
}

function detectAnomalies({ comparison = {}, coverage = {}, platform = 'ALL', comparisonSafe = true, thresholds = {} } = {}) {
  const scope = String(platform || 'ALL').toUpperCase();
  if (!comparisonSafe) return [];
  return RULES.filter(rule => scope === 'ALL' || rule.platform === scope).flatMap(rule => {
    const item = comparison[rule.key];
    const previous = number(item?.previous);
    const current = number(item?.current);
    const rate = Number(item?.change_rate);
    if (!item || !Number.isFinite(rate) || previous < rule.minimumPrevious || !coverageReady(coverage, rule.requiresCoverage)) return [];
    const magnitude = rule.direction === 'DOWN' ? -rate : rate;
    const limit = configuredLimit(rule, thresholds);
    if (magnitude < limit.warning) return [];
    const pairedGrowth = Number(comparison[rule.pairedGrowthKey]?.change_rate);
    if (rule.pairedGrowthKey && Number.isFinite(pairedGrowth) && pairedGrowth >= rate * 0.8) return [];
    const severity = magnitude >= limit.critical ? 'ERROR' : 'WARNING';
    const movement = rule.direction === 'DOWN' ? '하락' : '상승';
    return [{
      platform: rule.platform,
      metric: rule.metric,
      key: rule.key,
      direction: rule.direction,
      severity,
      current,
      previous,
      change_rate: rate,
      fingerprint: `ANOMALY:${rule.platform}:${rule.metric}:${rule.direction}`,
      title: `${rule.label} ${Math.abs(rate).toFixed(1)}% ${movement}`,
      message: `직전 동일기간 ${previous.toLocaleString('ko-KR')}에서 ${current.toLocaleString('ko-KR')}로 ${Math.abs(rate).toFixed(1)}% ${movement}했습니다.`,
      recommended_action: rule.action
    }];
  });
}

function toInsight(anomaly) {
  return {
    level: anomaly.severity === 'ERROR' ? 'danger' : 'warning',
    area: 'ANOMALY',
    title: anomaly.title,
    body: `${anomaly.message} ${anomaly.recommended_action}`
  };
}

function toRecommendation(anomaly) {
  return {
    priority: anomaly.severity === 'ERROR' ? 'URGENT' : 'HIGH',
    area: anomaly.platform,
    title: anomaly.title.replace(/\s[0-9.]+%\s(하락|상승)$/, ' 원인 점검'),
    reason: anomaly.message,
    expected: anomaly.recommended_action
  };
}

module.exports = { RULES, configuredLimit, detectAnomalies, toInsight, toRecommendation };
