import syncModule from '../../../../lib/automation/sync-all.js';
import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function POST(request) {
  if (!apiSafety.isAuthorized(request, authModule)) return apiSafety.unauthorized();
  try { return apiSafety.json({ ok: true, ...(await syncModule.syncCafe24('MANUAL')) }); }
  catch (error) { return apiSafety.json({ ok: false, error: error.message, ...(error.syncResult || {}) }, { status: 502 }); }
}
