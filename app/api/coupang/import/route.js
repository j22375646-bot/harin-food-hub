import authModule from '../../../../lib/dashboard-auth.js';
import importModule from '../../../../lib/coupang/file-import.js';
import reportModule from '../../../../lib/reports/weekly.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BYTES = 15 * 1024 * 1024;
const EXTENSIONS = new Set(['csv', 'xlsx']);
function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return Response.json({ ok: false, error: '쿠팡 파일을 선택해주세요.' }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ ok: false, error: '파일은 15MB 이하만 가능합니다.' }, { status: 413 });
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!EXTENSIONS.has(extension)) return Response.json({ ok: false, error: 'CSV 또는 XLSX 파일만 지원합니다.' }, { status: 415 });
    const result = await importModule.importFile({ buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name, fileType: file.type, dataset: form.get('dataset') });
    let report = null;
    if (result.period.start && result.period.end) {
      try {
        report = await reportModule.generateReport({ period: result.period, platform: 'COUPANG', reportType: 'ADHOC', mode: 'COUPANG_FILE_IMPORT', deduplicate: false });
      } catch (error) {
        report = { created: false, error: error.message };
      }
    }
    return Response.json({ ok: result.status !== 'FAILED', ...result, report }, { status: result.status === 'PARTIAL' ? 207 : 200 });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || '쿠팡 파일 가져오기에 실패했습니다.' }, { status: 500 });
  }
}
