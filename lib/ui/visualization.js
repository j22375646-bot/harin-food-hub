'use strict';

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const CHART_TONES=Object.freeze(['primary','secondary','positive','warning','negative']);
const CHART_TONE_ALIASES=Object.freeze({
  blue:'primary',
  lavender:'secondary',
  mint:'positive',
  amber:'warning',
  pink:'negative',
});

function normalizeChartTone(tone,index=0) {
  const value=String(tone||'').trim().toLowerCase();
  if(CHART_TONES.includes(value))return value;
  if(CHART_TONE_ALIASES[value])return CHART_TONE_ALIASES[value];
  return CHART_TONES[index%CHART_TONES.length];
}

function chartDomain(values) {
  if(!values.length)return null;
  const min=Math.min(0,...values);
  const max=Math.max(0,...values);
  if(min===0&&max===0)return {min:0,max:1,span:1};
  return {min,max,span:Math.max(1,max-min)};
}

function buildChartModel({ labels = [], series = [] } = {}) {
  const sourceSeries=Array.isArray(series)?series:[];
  const sourceLabels=Array.isArray(labels)?labels:[];
  const pointCount=Math.max(sourceLabels.length,...sourceSeries.map((item)=>Array.isArray(item?.values)?item.values.length:0),0);
  const normalizedLabels=Array.from({length:pointCount},(_,index)=>{
    const label=sourceLabels[index];
    return label===null||label===undefined||label===''?`항목 ${index+1}`:String(label);
  });
  const normalizedSeries = sourceSeries.map((item, index) => ({
    id: item.id || `series-${index + 1}`,
    label: item.label || `항목 ${index + 1}`,
    tone: normalizeChartTone(item.tone,index),
    values: Array.from({length:pointCount},(_,valueIndex)=>numericOrNull(Array.isArray(item.values)?item.values[valueIndex]:null)),
  }));
  const values = normalizedSeries.flatMap((item) => item.values).filter((value) => value !== null);
  const missingPointCount=normalizedSeries.reduce((count,item)=>count+item.values.filter((value)=>value===null).length,0);
  const domain=chartDomain(values);
  return {
    labels: normalizedLabels,
    series: normalizedSeries,
    status: values.length ? 'READY' : 'UNCOLLECTED',
    max: values.length ? Math.max(1, ...values.map((value) => Math.abs(value))) : null,
    domain,
    hasNegative:values.some((value)=>value<0),
    confirmedPointCount:values.length,
    missingPointCount,
    hasMissingEvidence: missingPointCount>0,
  };
}

function buildDonutModel(items = []) {
  const normalized=(Array.isArray(items)?items:[]).slice(0,5).map((item,index)=>{
    const parsed=numericOrNull(item?.value);
    const value=parsed!==null&&parsed>=0?parsed:null;
    return {
      ...item,
      id:item?.id||`donut-${index+1}`,
      label:item?.label||`항목 ${index+1}`,
      tone:normalizeChartTone(item?.tone,index),
      value,
      displayStatus:value===null?'CHECK_REQUIRED':'READY',
    };
  });
  const confirmed=normalized.filter((item)=>item.value!==null);
  return {
    items:normalized,
    status:confirmed.length?'READY':'UNCOLLECTED',
    total:confirmed.reduce((sum,item)=>sum+item.value,0),
    confirmedItemCount:confirmed.length,
    missingItemCount:normalized.length-confirmed.length,
    hasMissingEvidence:normalized.some((item)=>item.value===null),
  };
}

function buildWaterfallModel(items = []) {
  const normalized = (Array.isArray(items) ? items : []).map((item, index) => {
    const value = numericOrNull(item.value);
    return {
      ...item,
      id: item.id || `waterfall-${index + 1}`,
      value,
      displayStatus: value === null ? 'CHECK_REQUIRED' : 'READY',
    };
  });
  const values = normalized.map((item) => item.value).filter((value) => value !== null);
  return {
    items: normalized,
    status: values.length ? 'READY' : 'UNCOLLECTED',
    max: values.length ? Math.max(1, ...values.map((value) => Math.abs(value))) : null,
    hasMissingEvidence: normalized.some((item) => item.value === null),
  };
}

function buildRecentDailyCounts(rows = [], { days = 7, now = new Date() } = {}) {
  const end = new Date(now);
  if (Number.isNaN(end.getTime())) return [];
  end.setHours(23, 59, 59, 999);
  const result = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const start = new Date(end);
    start.setDate(end.getDate() - offset);
    start.setHours(0, 0, 0, 0);
    const finish = new Date(start);
    finish.setDate(start.getDate() + 1);
    const value = (Array.isArray(rows) ? rows : []).filter((row) => {
      const date = new Date(row?.occurredAt || row?.occurred_at || row?.created_at || '');
      return !Number.isNaN(date.getTime()) && date >= start && date < finish;
    }).length;
    result.push({
      label: new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(start),
      value,
    });
  }
  return result;
}

module.exports = { CHART_TONES, buildChartModel, buildDonutModel, buildRecentDailyCounts, buildWaterfallModel, normalizeChartTone, numericOrNull };

