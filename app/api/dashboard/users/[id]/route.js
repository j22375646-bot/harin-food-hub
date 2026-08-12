import usersModule from '../../../../../lib/dashboard-users.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  if (request.headers.get('x-harin-role') !== 'OWNER') return Response.json({ok:false,error:'OWNER 권한이 필요합니다.'},{status:403});
  try {
    const { id }=await params;
    const body=await request.json();
    const user=await usersModule.updateUser(id, body, {
      actorUserId:request.headers.get('x-harin-user-id'),
      actorUsername:request.headers.get('x-harin-username')
    });
    return Response.json({ok:true,user});
  } catch(error) {
    return Response.json({ok:false,error:error.message},{status:error.status||500});
  }
}
