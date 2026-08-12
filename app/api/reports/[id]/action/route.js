import authModule from '../../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';
import presentation from '../../../../../lib/reports/presentation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request, { params }) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ok:false,error:'Unauthorized'},{status:401});
  const { id } = await params;
  const body = await request.json();
  const db = supabaseModule.getSupabase();
  const found = await db.from('reports').select('id,platform,report_type,period_start,period_end,title,status,summary_json,version,is_latest').eq('id',id).maybeSingle();
  if (found.error) return Response.json({ok:false,error:found.error.message},{status:500});
  if (!found.data) return Response.json({ok:false,error:'보고서를 찾을 수 없습니다.'},{status:404});

  if (body.action === 'APPROVE') {
    if (!found.data.is_latest) return Response.json({ok:false,error:'최신 버전만 승인할 수 있습니다.'},{status:409});
    const approvedBy = String(body.approved_by || '관리자').trim().slice(0,50) || '관리자';
    const updated = await db.from('reports').update({status:'APPROVED',approved_at:new Date().toISOString(),approved_by:approvedBy}).eq('id',id).select('id,status,approved_at,approved_by').single();
    if (updated.error) return Response.json({ok:false,error:updated.error.message},{status:500});
    return Response.json({ok:true,report:updated.data});
  }

  if (body.action === 'RESTORE') {
    const restored = await db.rpc('create_report_version',{
      p_platform:found.data.platform,p_report_type:found.data.report_type,p_period_start:found.data.period_start,p_period_end:found.data.period_end,
      p_title:found.data.title,p_status:'FINAL',p_summary_json:found.data.summary_json,p_report_html:null,
      p_revision_note:`v${found.data.version}에서 복원`
    });
    if (restored.error) return Response.json({ok:false,error:restored.error.message},{status:500});
    const row = Array.isArray(restored.data) ? restored.data[0] : restored.data;
    const html = presentation.fullHtml({...row,summary_json:found.data.summary_json});
    const htmlUpdate = await db.from('reports').update({report_html:html}).eq('id',row.id);
    if (htmlUpdate.error) return Response.json({ok:false,error:htmlUpdate.error.message},{status:500});
    return Response.json({ok:true,report:row});
  }

  return Response.json({ok:false,error:'지원하지 않는 보고서 작업입니다.'},{status:400});
}
