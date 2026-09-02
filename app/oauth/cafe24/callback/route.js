import { after } from 'next/server';
import configModule from '../../../../lib/cafe24/config.js';
import stateModule from '../../../../lib/cafe24/oauth-state.js';
import clientModule from '../../../../lib/cafe24/client.js';
import financeCapabilityModule from '../../../../lib/cafe24/finance-capability.js';
import oauthCompletionModule from '../../../../lib/cafe24/oauth-completion.js';
import syncModule from '../../../../lib/automation/sync-all.js';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request) {
  try {
    const config = configModule.getConfig();
    const params = new URL(request.url).searchParams;
    if (!stateModule.validState(params.get('state'), config.clientSecret)) return Response.json({ ok: false, error: 'Invalid or expired OAuth state' }, { status: 400 });
    if (!params.get('code')) return Response.json({ ok: false, error: params.get('error') || 'Missing authorization code' }, { status: 400 });
    const token = await clientModule.exchangeCode(config, params.get('code'));
    const capability = await financeCapabilityModule.verifyFinanceCapability(config, token, {
      adminGet:clientModule.adminGet,
    });
    oauthCompletionModule.scheduleAuthorizedSync({
      capability,
      schedule:after,
      sync:trigger=>syncModule.syncCafe24(trigger),
    });
    return Response.redirect(
      financeCapabilityModule.callbackDestination(request.url, capability),
      303,
    );
  } catch (error) { return Response.json({ ok: false, error: error.message }, { status: 502 }); }
}
