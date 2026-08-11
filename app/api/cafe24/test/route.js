import configModule from '../../../../lib/cafe24/config.js';
import clientModule from '../../../../lib/cafe24/client.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const result = await clientModule.adminGet(configModule.getConfig(), '/products', { limit: 1 });
    return Response.json({ ok: true, httpStatus: result.status, productCount: result.payload?.products?.length || 0 });
  } catch (error) { return Response.json({ ok: false, error: error.message }, { status: 502 }); }
}
