import authModule from '../../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../../lib/cafe24/supabase.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}
function filename(value){return String(value||'report').replace(/[\\/:*?"<>|]/g,'-').slice(0,100);}

export async function GET(request,{params}){
  if(!authModule.verifySession(cookieValue(request)))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  const {id}=await params;
  const result=await supabaseModule.getSupabase().from('reports').select('title,report_html').eq('id',id).maybeSingle();
  if(result.error)return Response.json({ok:false,error:result.error.message},{status:500});
  if(!result.data)return Response.json({ok:false,error:'보고서를 찾을 수 없습니다.'},{status:404});
  const html=result.data.report_html||`<!doctype html><html lang="ko"><meta charset="utf-8"><body><h1>${result.data.title}</h1><p>이 보고서에는 저장된 HTML 본문이 없습니다.</p></body></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(filename(result.data.title))}.html`,'cache-control':'private, no-store'}});
}
