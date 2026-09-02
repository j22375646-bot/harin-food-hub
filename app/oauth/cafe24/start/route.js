import configModule from '../../../../lib/cafe24/config.js';
import stateModule from '../../../../lib/cafe24/oauth-state.js';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const config = configModule.getConfig();
    const url = new URL(`https://${config.mallId}.cafe24api.com/api/v2/oauth/authorize`);
    url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, state: stateModule.createState(config.clientSecret), redirect_uri: config.redirectUri, scope: config.scopes.join(' ') });
    return Response.redirect(url);
  } catch (error) { return Response.json({ ok: false, error: error.message }, { status: 500 }); }
}
