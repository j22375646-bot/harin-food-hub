'use strict';

const number = value => Number(value || 0);
const integer = value => Math.round(number(value)).toLocaleString('ko-KR');
const won = value => `${integer(value)}원`;
const percent = value => value == null ? '미수집' : `${number(value).toFixed(1)}%`;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function platformName(platform) {
  return { ALL:'통합', NAVER:'네이버', CAFE24:'Cafe24', COUPANG:'쿠팡' }[platform] || platform || '통합';
}

function typeName(type) {
  return { DAILY:'일일', WEEKLY:'주간', MONTHLY:'월간', ADHOC:'수시' }[type] || type || '수시';
}

function kpisFor(platform, summary = {}) {
  const cafe = summary.cafe24 || {}, naver = summary.naver || {}, coupang = summary.coupang || {}, profit = summary.profitability || {};
  if (platform === 'NAVER') return [
    ['광고비', won(naver.ad_spend)], ['전환매출', won(naver.revenue)], ['Paid ROAS', percent(naver.roas)], ['전환', `${integer(naver.purchase_count)}건`]
  ];
  if (platform === 'CAFE24') return [
    ['결제 매출', won(cafe.revenue)], ['주문', `${integer(cafe.orders)}건`], ['방문자', `${integer(cafe.visitors)}명`], ['방문→주문', percent(cafe.conversion_rate)]
  ];
  if (platform === 'COUPANG') return [
    ['주문 매출', won(coupang.gross_sales)], ['주문', `${integer(coupang.orders)}건`], ['광고 ROAS', percent(coupang.ad_roas)], ['정산금액', won(coupang.settlement_amount)]
  ];
  return [
    ['Cafe24 매출', won(cafe.revenue)], ['쿠팡 매출', won(coupang.gross_sales)], ['총 광고비', won(number(naver.ad_spend) + number(coupang.ad_spend))], ['통합 MER', percent(profit.mer)]
  ];
}

function textList(rows, fallback) {
  const values = (rows || []).map(item => typeof item === 'string' ? item : item?.body || item?.title).filter(Boolean);
  return values.length ? values : [fallback];
}

function ownerSummary(report) {
  const summary = report.summary_json || report.summary || {};
  const executive = summary.executive || {};
  const platform = report.platform || 'ALL';
  const coverage = summary.data_coverage || {};
  const notes = [];
  for (const [key, value] of Object.entries(coverage)) {
    if (value?.status && value.status !== 'OK') notes.push(`${key}: ${value.actual_days ?? 0}/${value.expected_days ?? 0}일 수집 (${value.status})`);
  }
  if (summary.comparison_guard?.safe === false) notes.push(summary.comparison_guard.message || '기간 내 변경 이벤트로 단순 비교에 주의가 필요합니다.');
  if (summary.cafe24?.analytics?.coverage?.referrerAttribution === 'NOT_COLLECTED') notes.push('Cafe24 유입경로별 주문·매출은 API 미수집입니다.');
  return {
    title: report.title || `${platformName(platform)} ${typeName(report.report_type)} 보고서`,
    platform: platformName(platform), type: typeName(report.report_type), version: number(report.version) || 1,
    period: `${report.period_start || summary.period?.start || '-'} ~ ${report.period_end || summary.period?.end || '-'}`,
    generatedAt: report.created_at || summary.generated_at || null,
    score: summary.score,
    kpis: kpisFor(platform, summary),
    doingWell: textList(executive.doing_well, '성과 데이터가 축적되는 중입니다.').slice(0, 3),
    problems: textList(executive.problems, '즉시 조치가 필요한 중대 문제는 발견되지 않았습니다.').slice(0, 3),
    opportunities: textList(executive.opportunities, '추가 성장기회 분석을 위한 데이터가 축적되는 중입니다.').slice(0, 3),
    actions: textList(executive.today_actions, '오늘의 추가 실행 액션은 없습니다.').slice(0, 3),
    dataNotes: notes.slice(0, 4),
    approvedAt: report.approved_at || null,
    approvedBy: report.approved_by || null
  };
}

function listHtml(items) {
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function documentStyles(owner) {
  return `<style>
  :root{--ink:#171827;--muted:#6d7182;--line:#e5e7ee;--orange:#ff7a1a;--good:#12865f;--warn:#b75d00;--paper:#fff}
  *{box-sizing:border-box}body{margin:0;background:#eef0f5;color:var(--ink);font-family:"Malgun Gothic","Apple SD Gothic Neo",Arial,sans-serif;line-height:1.55}
  .toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;gap:8px;padding:12px max(20px,calc((100% - 960px)/2));background:#171827}
  .toolbar button{border:0;border-radius:9px;padding:10px 16px;font-weight:800;cursor:pointer}.toolbar .primary{background:var(--orange);color:#fff}
  .paper{width:min(960px,calc(100% - 24px));margin:24px auto;background:var(--paper);padding:42px 48px;border-radius:20px;box-shadow:0 12px 40px #25273818}
  header{display:flex;justify-content:space-between;gap:30px;border-bottom:3px solid var(--ink);padding-bottom:22px}header small{color:var(--orange);font-weight:900;letter-spacing:.12em}h1{font-size:30px;line-height:1.25;margin:7px 0 8px}header p{margin:0;color:var(--muted)}.score{text-align:right;min-width:120px}.score b{display:block;font-size:46px;line-height:1}.score span{color:var(--muted)}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0}.kpi{background:#f5f6f9;border-radius:12px;padding:15px}.kpi small,.kpi b{display:block}.kpi small{color:var(--muted)}.kpi b{font-size:20px;margin-top:4px}
  .executive{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.box{border:1px solid var(--line);border-radius:14px;padding:17px}.box h2{font-size:16px;margin:0 0 9px}.box ul{padding-left:19px;margin:0}.box li{margin:6px 0;font-size:13px}.box.good{border-top:4px solid var(--good)}.box.problem{border-top:4px solid #df4f50}.box.chance{border-top:4px solid #5269db}
  h2.section{font-size:20px;margin:28px 0 10px}.actions{counter-reset:item;display:grid;gap:9px}.action{display:flex;gap:12px;padding:13px 15px;background:#fff7ed;border-radius:12px;font-weight:700}.action:before{counter-increment:item;content:counter(item);display:grid;place-items:center;min-width:25px;height:25px;border-radius:50%;background:var(--orange);color:#fff}
  .notes{margin-top:22px;padding:13px 16px;background:#f5f6f9;border-radius:10px;color:var(--muted);font-size:12px}.notes b{color:var(--ink)}footer{display:flex;justify-content:space-between;margin-top:24px;padding-top:12px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}
  .detail-section{break-inside:avoid;margin-top:28px}.detail-section h2{font-size:20px}.finding{border-left:4px solid var(--orange);background:#fff7ed;padding:12px 14px;margin:8px 0;border-radius:0 10px 10px 0}.finding.good{border-color:var(--good);background:#edf9f4}.finding b,.finding span{display:block}.finding span{font-size:13px;color:#4e5262}.table{width:100%;border-collapse:collapse}.table th,.table td{border-bottom:1px solid var(--line);padding:9px;text-align:left;font-size:12px}.table th{background:#f5f6f9}
  @media(max-width:700px){.paper{width:100%;margin:0;border-radius:0;padding:25px 20px}.executive,.kpis{grid-template-columns:1fr 1fr}header{display:block}.score{text-align:left;margin-top:18px}.toolbar{padding:10px}.toolbar button{flex:1}}
  @page{size:A4 ${owner ? 'portrait' : 'portrait'};margin:11mm}@media print{body{background:#fff}.toolbar{display:none}.paper{width:auto;margin:0;padding:0;border-radius:0;box-shadow:none}${owner ? '.paper{font-size:11px}h1{font-size:24px}.kpis{margin:14px 0}.box{padding:12px}.box li{font-size:11px}.notes{margin-top:14px}footer{margin-top:14px}' : ''}}
  </style>`;
}

function ownerHtml(report) {
  const view = ownerSummary(report);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(view.title)} - 사장님 요약</title>${documentStyles(true)}</head><body>
  <nav class="toolbar"><button onclick="history.back()">돌아가기</button><button class="primary" onclick="window.print()">PDF 저장 / 인쇄</button></nav><main class="paper">
  <header><div><small>${escapeHtml(view.platform.toUpperCase())} EXECUTIVE BRIEF</small><h1>${escapeHtml(view.title)}</h1><p>${escapeHtml(view.period)} · v${view.version}${view.approvedAt ? ' · 승인본' : ''}</p></div><div class="score"><span>운영점수</span><b>${view.score ?? '-'}</b><span>/ 100</span></div></header>
  <section class="kpis">${view.kpis.map(([label,value]) => `<div class="kpi"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join('')}</section>
  <section class="executive"><article class="box good"><h2>잘되고 있는 것</h2>${listHtml(view.doingWell)}</article><article class="box problem"><h2>문제</h2>${listHtml(view.problems)}</article><article class="box chance"><h2>성장기회</h2>${listHtml(view.opportunities)}</article></section>
  <h2 class="section">오늘의 액션 TOP 3</h2><section class="actions">${view.actions.map(item => `<div class="action">${escapeHtml(item)}</div>`).join('')}</section>
  ${view.dataNotes.length ? `<aside class="notes"><b>데이터 해석 주의</b>${listHtml(view.dataNotes)}</aside>` : ''}
  <footer><span>하린식품 통합 수익·마케팅 운영 시스템</span><span>${view.generatedAt ? escapeHtml(new Date(view.generatedAt).toLocaleString('ko-KR')) : ''}</span></footer>
  </main></body></html>`;
}

function fullHtml(report) {
  const view = ownerSummary(report), summary = report.summary_json || report.summary || {};
  const insights = summary.insights || [], recommendations = summary.recommendations || [];
  const campaigns = summary.naver?.top_campaigns || summary.coupang?.top_campaigns || [];
  const products = summary.cafe24?.top_products || summary.cafe24?.analytics?.products || summary.coupang?.top_products || [];
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(view.title)}</title>${documentStyles(false)}</head><body>
  <nav class="toolbar"><button onclick="history.back()">돌아가기</button><button class="primary" onclick="window.print()">PDF 저장 / 인쇄</button></nav><main class="paper">
  <header><div><small>${escapeHtml(view.platform.toUpperCase())} ${escapeHtml(view.type.toUpperCase())} REPORT</small><h1>${escapeHtml(view.title)}</h1><p>${escapeHtml(view.period)} · v${view.version}${view.approvedAt ? ` · ${escapeHtml(view.approvedBy || '관리자')} 승인` : ''}</p></div><div class="score"><span>운영점수</span><b>${view.score ?? '-'}</b><span>/ 100</span></div></header>
  <section class="kpis">${view.kpis.map(([label,value]) => `<div class="kpi"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`).join('')}</section>
  <section class="executive"><article class="box good"><h2>잘되고 있는 것</h2>${listHtml(view.doingWell)}</article><article class="box problem"><h2>문제</h2>${listHtml(view.problems)}</article><article class="box chance"><h2>성장기회</h2>${listHtml(view.opportunities)}</article></section>
  <section class="detail-section"><h2>자동 진단</h2>${insights.length ? insights.map(item => `<div class="finding ${item.level === 'good' ? 'good' : ''}"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.body)}</span></div>`).join('') : '<p>진단 데이터가 없습니다.</p>'}</section>
  <section class="detail-section"><h2>권장 조치</h2><ol>${recommendations.map(item => `<li><b>${escapeHtml(item.title)}</b> - ${escapeHtml(item.reason || item.expected || '')}</li>`).join('') || '<li>추가 권장 조치가 없습니다.</li>'}</ol></section>
  ${campaigns.length ? `<section class="detail-section"><h2>캠페인 성과</h2><table class="table"><thead><tr><th>캠페인</th><th>광고비</th><th>매출</th><th>ROAS</th></tr></thead><tbody>${campaigns.slice(0,12).map(item => `<tr><td>${escapeHtml(item.name || item.campaign_name)}</td><td>${won(item.cost ?? item.ad_spend)}</td><td>${won(item.revenue)}</td><td>${percent(item.roas)}</td></tr>`).join('')}</tbody></table></section>` : ''}
  ${products.length ? `<section class="detail-section"><h2>상품 성과</h2><table class="table"><thead><tr><th>상품</th><th>주문</th><th>판매수량</th><th>매출</th></tr></thead><tbody>${products.slice(0,12).map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${integer(item.orders)}건</td><td>${integer(item.quantity)}개</td><td>${won(item.revenue)}</td></tr>`).join('')}</tbody></table></section>` : ''}
  ${view.dataNotes.length ? `<aside class="notes"><b>데이터 해석 주의</b>${listHtml(view.dataNotes)}</aside>` : ''}
  <footer><span>하린식품 통합 수익·마케팅 운영 시스템</span><span>${view.generatedAt ? escapeHtml(new Date(view.generatedAt).toLocaleString('ko-KR')) : ''}</span></footer>
  </main></body></html>`;
}

module.exports = { escapeHtml, ownerSummary, ownerHtml, fullHtml, platformName, typeName, kpisFor };
