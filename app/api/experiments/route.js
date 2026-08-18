import authModule from '../../../lib/dashboard-auth.js';
import service from '../../../lib/experiments/service.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request) {
  const cookie = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
  return authModule.verifySession(cookie);
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const masterProductId=new URL(request.url).searchParams.get('master_product_id');
    return Response.json({ ok: true, ...(await service.listLab({masterProductId})) });
  }
  catch (error) { return Response.json({ ok: false, error: error.message }, { status: 500 }); }
}

export async function POST(request) {
  if (!authorized(request)) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    if (body.action === 'CREATE_TEST') return Response.json({ ok: true, test: await service.createTest(body) });
    if (body.action === 'CREATE_BENCHMARK') return Response.json({ ok: true, benchmark: await service.createBenchmark(body) });
    return Response.json({ ok: false, error: '지원하지 않는 작업입니다.' }, { status: 400 });
  } catch (error) { return Response.json({ ok: false, error: error.message }, { status: 500 }); }
}
