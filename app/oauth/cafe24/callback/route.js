import configModule from '../../../../lib/cafe24/config.js';
import stateModule from '../../../../lib/cafe24/oauth-state.js';
import clientModule from '../../../../lib/cafe24/client.js';
export const runtime = 'nodejs';
export async function GET(request) {
  try {
    const config = configModule.getConfig();
    const params = new URL(request.url).searchParams;
    if (!stateModule.validState(params.get('state'), config.clientSecret)) return Response.json({ ok: false, error: 'Invalid or expired OAuth state' }, { status: 400 });
    if (!params.get('code')) return Response.json({ ok: false, error: params.get('error') || 'Missing authorization code' }, { status: 400 });
    await clientModule.exchangeCode(config, params.get('code'));
    return Response.json({ ok: true, connected: true });
  } catch (error) { return Response.json({ ok: false, error: error.message }, { status: 502 }); }
}
