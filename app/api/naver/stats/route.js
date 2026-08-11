import authModule from '../../../../lib/dashboard-auth.js';
import syncModule from '../../../../lib/naver/sync.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
export const runtime='nodejs'; export const dynamic='force-dynamic'; export const maxDuration=300;
function cookieValue(request){return request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}
export async function POST(request){if(!authModule.verifySession(cookieValue(request)))return Response.json({ok:false,error:'Unauthorized'},{status:401});try{const db=supabaseModule.getSupabase();const result=await db.from('naver_campaigns').select('ncc_campaign_id');if(result.error)throw result.error;const campaigns=(result.data||[]).map(item=>({nccCampaignId:item.ncc_campaign_id}));const stats=await syncModule.syncStats(db,campaigns,30);return Response.json({ok:true,campaigns:campaigns.length,stats});}catch(error){return Response.json({ok:false,error:error.message},{status:error.status||500});}}
