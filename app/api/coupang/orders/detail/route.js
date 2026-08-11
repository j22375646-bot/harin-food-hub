import authModule from '../../../../../lib/dashboard-auth.js';
import actionsModule from '../../../../../lib/coupang/actions.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) { return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('='); }

export async function GET(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try {
    const shipmentBoxId = new URL(request.url).searchParams.get('shipmentBoxId');
    return Response.json({ok:true,order:await actionsModule.getOrderDetail(shipmentBoxId)},{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    console.error('[coupang order detail]', { status:error.status||500, code:error.code||null, message:error.message });
    return Response.json({ok:false,code:error.code||null,error:error.message},{status:error.status||502});
  }
}
