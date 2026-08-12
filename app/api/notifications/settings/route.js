import authModule from '../../../../lib/dashboard-auth.js';
import notificationService from '../../../../lib/notifications/service.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}
function authorized(request){return authModule.verifySession(cookieValue(request));}

export async function GET(request){if(!authorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401});try{return Response.json({ok:true,...await notificationService.centerData()});}catch(error){console.error('[notification center]',error);return Response.json({ok:false,error:error.message},{status:500});}}
export async function POST(request){if(!authorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401});try{const settings=await notificationService.updateSettings(await request.json());return Response.json({ok:true,settings});}catch(error){return Response.json({ok:false,error:error.message},{status:400});}}
