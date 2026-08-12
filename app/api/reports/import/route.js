import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import apiSafety from '../../../../lib/api/safety.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS = new Set(['html', 'htm', 'md', 'txt', 'csv']);

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}
function stripMarkup(value) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function firstMatch(text, patterns) {
  for (const pattern of patterns) { const match = text.match(pattern); if (match) return Number(String(match[1]).replace(/,/g, '')); }
  return null;
}
function parseDate(value) {
  const match = String(value || '').match(/(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
}
function reportSummary(text, file) {
  const plain = stripMarkup(text).slice(0, 300000);
  return { file_name: file.name, file_type: file.type || 'text/plain', file_size: file.size, imported_at: new Date().toISOString(), text_preview: plain.slice(0, 1000), metrics: { roas: firstMatch(plain, [/ROAS[^0-9]{0,20}([0-9,.]+)/i, /광고수익률[^0-9]{0,20}([0-9,.]+)/]), ad_spend: firstMatch(plain, [/광고비[^0-9]{0,20}([0-9,]+)/, /비용[^0-9]{0,20}([0-9,]+)/]), revenue: firstMatch(plain, [/구매\s*매출[^0-9]{0,20}([0-9,]+)/, /전환\s*매출[^0-9]{0,20}([0-9,]+)/]) }, dates: [...plain.matchAll(/20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2}/g)].map(item => parseDate(item[0])).filter(Boolean) };
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get('file');
    const platform = String(form.get('platform') || '').toUpperCase();
    if (!file || typeof file.text !== 'function') return Response.json({ ok: false, error: '파일을 선택해주세요.' }, { status: 400 });
    if (!['NAVER', 'COUPANG'].includes(platform)) return Response.json({ ok: false, error: '플랫폼을 확인해주세요.' }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ ok: false, error: '파일은 5MB 이하만 가능합니다.' }, { status: 413 });
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!EXTENSIONS.has(extension)) return Response.json({ ok: false, error: 'HTML, MD, TXT, CSV 파일만 지원합니다.' }, { status: 415 });
    const text = await file.text();
    const summary = reportSummary(text, file);
    const today = new Date().toISOString().slice(0, 10);
    const requestedStart = String(form.get('period_start') || '');
    const requestedEnd = String(form.get('period_end') || '');
    if ((requestedStart && !apiSafety.isoDate(requestedStart)) || (requestedEnd && !apiSafety.isoDate(requestedEnd))) return apiSafety.json({ ok:false, error:'보고서 날짜 형식을 확인해주세요.' }, { status:400 });
    const periodStart = apiSafety.isoDate(requestedStart) || summary.dates[0] || today;
    const periodEnd = apiSafety.isoDate(requestedEnd) || summary.dates[1] || summary.dates[0] || today;
    if (periodStart > periodEnd) return apiSafety.json({ ok:false, error:'보고서 기간을 확인해주세요.' }, { status:400 });
    const title = String(form.get('title') || '').trim() || file.name.replace(/\.[^.]+$/, '');
    const { data, error } = await supabaseModule.getSupabase().from('reports').insert({ platform, report_type: 'ADHOC', period_start: periodStart, period_end: periodEnd, title: title.slice(0, 200), status: 'FINAL', summary_json: summary, report_html: ['html', 'htm'].includes(extension) ? text : null }).select('id,title,platform,period_start,period_end,status').single();
    if (error) throw error;
    return Response.json({ ok: true, report: data, metrics: summary.metrics });
  } catch (error) { return Response.json({ ok: false, error: error.message }, { status: 500 }); }
}
