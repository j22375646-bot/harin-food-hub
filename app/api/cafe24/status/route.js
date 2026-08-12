import configModule from '../../../../lib/cafe24/config.js';
import tokenModule from '../../../../lib/cafe24/token-store.js';
import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try {
    const config = configModule.getConfig();
    return apiSafety.json({ configured: true, connected: Boolean(await tokenModule.readToken()), mallId: config.mallId, tokenStorage: 'supabase' });
  } catch (error) { return apiSafety.json({ configured: false, connected: false, error: error.message }, { status: 500 }); }
}
