import authModule from '../../../../lib/dashboard-auth.js';
import notificationService from '../../../../lib/notifications/service.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}

export async function POST(request){
  if(!authModule.verifySession(cookieValue(request)))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const body=await request.json();const db=supabaseModule.getSupabase();
    if(body.action==='REPORT'&&body.report_id){const delivery=await notificationService.deliverReport(String(body.report_id),{db,force:true,triggerType:'MANUAL',cadence:'MANUAL'});return Response.json({ok:delivery.status==='SENT',delivery},{status:delivery.status==='SENT'?200:400});}
    if(body.action==='ALERTS'){
      const result=await db.from('alerts').select('id,platform,severity,title,message,fingerprint').eq('status','OPEN').order('created_at',{ascending:false}).limit(20);if(result.error)throw result.error;
      const delivery=await notificationService.deliverAlerts(result.data||[],{db,force:true,triggerType:'MANUAL'});return Response.json({ok:delivery.status==='SENT',delivery},{status:delivery.status==='SENT'?200:400});
    }
    if(body.action==='TEST'){
      const delivery=await notificationService.deliver({eventType:'TEST',subject:'[하린식품] 이메일 알림 연결 테스트',html:'<div style="font-family:Arial,sans-serif"><h1>연결 성공</h1><p>하린식품 통합 관리 허브의 보고서·이상징후 이메일 발송이 정상 연결되었습니다.</p></div>',triggerType:'MANUAL',force:true,db});
      return Response.json({ok:delivery.status==='SENT',delivery},{status:delivery.status==='SENT'?200:400});
    }
    return Response.json({ok:false,error:'지원하지 않는 발송 요청입니다.'},{status:400});
  }catch(error){console.error('[notification send]',error);return Response.json({ok:false,error:error.message},{status:500});}
}
