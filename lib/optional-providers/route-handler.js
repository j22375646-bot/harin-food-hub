'use strict';

const auth=require('../dashboard-auth.js');const supabase=require('../cafe24/supabase.js');const readiness=require('./readiness.js');
function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${auth.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}
async function handleDeepLProbe(request){if(!auth.verifySession(cookieValue(request)))return Response.json({ok:false,error:'Unauthorized'},{status:401});try{const result=await readiness.probeDeepL({db:supabase.getSupabase()});return Response.json({ok:true,result},{headers:{'Cache-Control':'no-store'}});}catch(error){return Response.json({ok:false,code:error.code||'DEEPL_USAGE_PROBE_FAILED',error:readiness.publicError(error)},{status:error.status||502,headers:{'Cache-Control':'no-store'}});}}
module.exports={handleDeepLProbe};
