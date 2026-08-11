import authModule from '../../../../../lib/dashboard-auth.js';
import actionsModule from '../../../../../lib/coupang/actions.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) { return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('='); }

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try {
    const body=await request.json();
    if(body.confirm!==true)return Response.json({ok:false,error:'실제 CS 답변 전송 확인이 필요합니다.'},{status:400});
    return Response.json({ok:true,...await actionsModule.executeCsAction(body.action,body)});
  } catch(error){return Response.json({ok:false,error:error.message,detail:error.response||null},{status:error.status||502});}
}
