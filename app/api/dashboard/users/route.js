import authModule from '../../../../lib/dashboard-auth.js';
import usersModule from '../../../../lib/dashboard-users.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function owner(request) {
  return request.headers.get('x-harin-role') === 'OWNER';
}

export async function GET(request) {
  if (!owner(request)) return Response.json({ok:false,error:'OWNER 권한이 필요합니다.'},{status:403});
  try {
    return Response.json({ok:true,users:await usersModule.listUsers()},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    return Response.json({ok:false,error:error.message},{status:error.status||500});
  }
}

export async function POST(request) {
  if (!owner(request)) return Response.json({ok:false,error:'OWNER 권한이 필요합니다.'},{status:403});
  try {
    const body=await request.json();
    return Response.json({
      ok:true,
      user:await usersModule.createUser(body, {
        actorUserId:request.headers.get('x-harin-user-id'),
        actorUsername:request.headers.get('x-harin-username')
      })
    },{status:201});
  } catch(error) {
    return Response.json({ok:false,error:error.message},{status:error.status||500});
  }
}
