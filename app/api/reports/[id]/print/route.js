import authModule from '../../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import presentation from '../../../../../lib/reports/presentation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function GET(request, { params }) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ok:false,error:'Unauthorized'},{status:401});
  const { id } = await params;
  const result = await supabaseModule.getSupabase().from('reports').select('id,platform,report_type,period_start,period_end,title,status,summary_json,version,is_latest,revision_note,approved_at,approved_by,created_at').eq('id',id).maybeSingle();
  if (result.error) return Response.json({ok:false,error:result.error.message},{status:500});
  if (!result.data) return Response.json({ok:false,error:'보고서를 찾을 수 없습니다.'},{status:404});
  const owner = new URL(request.url).searchParams.get('mode') === 'owner';
  const html = owner ? presentation.ownerHtml(result.data) : presentation.fullHtml(result.data);
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});
}
