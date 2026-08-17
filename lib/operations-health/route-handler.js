'use strict';

const auth=require('../dashboard-auth.js');
const supabase=require('../cafe24/supabase.js');
const readiness=require('./readiness.js');

function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${auth.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}
async function handleProbe(request,provider){
  if(!auth.verifySession(cookieValue(request)))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{const result=await readiness.probeProvider(provider,{db:supabase.getSupabase()});return Response.json({ok:true,result},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return Response.json({ok:false,code:error.code||'OPERATIONS_HEALTH_PROBE_FAILED',error:readiness.publicError(error)},{status:error.status||502,headers:{'Cache-Control':'no-store'}});}
}
module.exports={handleProbe};
