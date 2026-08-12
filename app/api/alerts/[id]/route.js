import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}

export async function POST(request,{params}){
  if(!authModule.verifySession(cookieValue(request)))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const {id}=await params,body=await request.json(),action=String(body.action||'').toUpperCase(),now=new Date().toISOString();
    const updates=action==='ACKNOWLEDGE'?{status:'ACKNOWLEDGED',acknowledged_at:now,resolved_at:null}:action==='RESOLVE'?{status:'RESOLVED',resolved_at:now}:action==='REOPEN'?{status:'OPEN',acknowledged_at:null,resolved_at:null}:null;
    if(!updates)return Response.json({ok:false,error:'지원하지 않는 알림 처리입니다.'},{status:400});
    const result=await supabaseModule.getSupabase().from('alerts').update(updates).eq('id',id).select('id,status,acknowledged_at,resolved_at').single();
    if(result.error)throw result.error;return Response.json({ok:true,alert:result.data});
  }catch(error){return Response.json({ok:false,error:error.message},{status:500});}
}
