import configModule from '../../../../lib/cafe24/config.js';
import tokenModule from '../../../../lib/cafe24/token-store.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const config = configModule.getConfig();
    return Response.json({ configured: true, connected: Boolean(await tokenModule.readToken()), mallId: config.mallId, tokenStorage: 'supabase' });
  } catch (error) { return Response.json({ configured: false, connected: false, error: error.message }, { status: 500 }); }
}
