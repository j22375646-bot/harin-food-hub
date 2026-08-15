import authModule from '../../../../lib/dashboard-auth.js';
import notificationService from '../../../../lib/notifications/service.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}
function responseFor(delivery){const ok=['SENT','SKIPPED'].includes(delivery.status);return Response.json({ok,delivery},{status:ok?200:400});}

export async function POST(request){
  if(!authModule.verifySession(cookieValue(request)))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const body=await request.json();const db=supabaseModule.getSupabase();
    if(body.action==='REPORT'&&body.report_id){
      const delivery=await notificationService.deliverReport(String(body.report_id),{db,force:false,triggerType:'MANUAL',cadence:'MANUAL'});
      return responseFor(delivery);
    }
    if(body.action==='ALERTS'){
      const result=await db.from('alerts').select('id,platform,severity,title,message,fingerprint').eq('status','OPEN').order('created_at',{ascending:false}).limit(20);if(result.error)throw result.error;
      const delivery=await notificationService.deliverAlerts(result.data||[],{db,force:false,triggerType:'MANUAL'});
      return responseFor(delivery);
    }
    if(body.action==='TEST'){
      if(process.env.NODE_ENV==='production')return Response.json({ok:false,error:'운영 환경에서는 테스트 발송을 사용할 수 없습니다.',code:'TEST_API_DISABLED'},{status:404});
      const bucket=Math.floor(Date.now()/(10*60*1000));
      const delivery=await notificationService.deliver({eventType:'TEST',subject:'[하린식품] 이메일 알림 연결 테스트',html:'<div style="font-family:Arial,sans-serif"><h1>연결 성공</h1><p>하린식품 통합 관리 허브의 이메일 발송이 정상 연결되었습니다.</p></div>',triggerType:'MANUAL',force:false,dedupeKey:`manual-test:${bucket}`,db});
      return responseFor(delivery);
    }
    return Response.json({ok:false,error:'지원하지 않는 발송 요청입니다.'},{status:400});
  }catch(error){console.error('[notification send]',error);return Response.json({ok:false,error:error.message},{status:500});}
}
