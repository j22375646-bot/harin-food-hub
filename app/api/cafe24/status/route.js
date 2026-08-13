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
    const token = await tokenModule.readToken();
    const grantedScopes = new Set(Array.isArray(token?.scopes) ? token.scopes : String(token?.scope || '').split(/[\s,]+/).filter(Boolean));
    const missingScopes = config.requiredScopes.filter(scope => !grantedScopes.has(scope));
    return apiSafety.json({
      configured:true,
      connected:Boolean(token?.access_token),
      mallId:config.mallId,
      tokenStorage:'supabase',
      grantedScopes:[...grantedScopes],
      requestedScopes:config.scopes,
      missingScopes,
      reconnectRequired:Boolean(token?.access_token && missingScopes.length)
    });
  } catch (error) { return apiSafety.json({ configured: false, connected: false, error: error.message }, { status: 500 }); }
}
