import authModule from '../../../../lib/dashboard-auth.js';
import costImportModule from '../../../../lib/coupang/cost-file-import.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 20;

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter(file => file && typeof file.arrayBuffer === 'function');
    if (!files.length) return Response.json({ ok: false, error: '쿠팡 정산·비용 XLSX 파일을 선택해주세요.' }, { status: 400 });
    if (files.length > MAX_FILES) return Response.json({ ok: false, error: `한 번에 최대 ${MAX_FILES}개까지 올릴 수 있습니다.` }, { status: 400 });
    const results = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.xlsx')) { results.push({ fileName: file.name, ok: false, error: 'XLSX 파일만 지원합니다.' }); continue; }
      if (file.size > MAX_FILE_BYTES) { results.push({ fileName: file.name, ok: false, error: '파일은 20MB 이하여야 합니다.' }); continue; }
      try {
        const result = await costImportModule.importCostFile({ buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name });
        results.push({ fileName: file.name, ok: true, ...result });
      } catch (error) {
        results.push({ fileName: file.name, ok: false, error: error.message || '파일 처리 실패' });
      }
    }
    const summary = results.reduce((sum, item) => ({
      files: sum.files + 1,
      succeeded: sum.succeeded + (item.ok ? 1 : 0),
      failed: sum.failed + (item.ok ? 0 : 1),
      storedRows: sum.storedRows + Number(item.counts?.storedRows || 0),
      duplicateRows: sum.duplicateRows + Number(item.counts?.duplicateRows || 0),
      invalidRows: sum.invalidRows + Number(item.counts?.invalidRows || 0)
    }), { files: 0, succeeded: 0, failed: 0, storedRows: 0, duplicateRows: 0, invalidRows: 0 });
    return Response.json({ ok: summary.failed === 0, summary, results }, { status: summary.failed ? 207 : 200 });
  } catch (error) {
    return Response.json({ ok: false, error: error.message || '쿠팡 비용 파일 업로드에 실패했습니다.' }, { status: 500 });
  }
}
