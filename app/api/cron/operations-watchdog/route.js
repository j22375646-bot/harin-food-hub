import supabaseModule from '../../../../lib/cafe24/supabase.js';
import reliabilityModule from '../../../../lib/operations/reliability-center.js';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=30;
function authorized(request){const secret=String(process.env.CRON_SECRET||'').trim();return Boolean(secret)&&request.headers.get('authorization')===`Bearer ${secret}`;}
export async function GET(request){if(!authorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401});try{const worker=await reliabilityModule.runWorkerWatchdog(supabaseModule.getSupabase());return Response.json({ok:true,checked_at:new Date().toISOString(),worker});}catch(error){console.error('[operations watchdog]',error);return Response.json({ok:false,error:error.message||'watchdog failed'},{status:500});}}
