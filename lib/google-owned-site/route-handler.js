'use strict';

const auth=require('../dashboard-auth.js');
const supabase=require('../cafe24/supabase.js');
const readiness=require('./readiness.js');
const requestGuard=require('../provider-operations/request-guard.js');
const providerConfig=require('./config.js');

function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${auth.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}

async function handleProbe(request,provider){
  if(!auth.verifySession(cookieValue(request)))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const db=supabase.getSupabase();
    const config=providerConfig.providerConfig(provider),missingFields=providerConfig.missingFields(provider,config);
    const result=await requestGuard.protectedRead({db,provider,requestInput:{probe:'connection'},ttlMs:15*60*1000,killSwitchEnabled:config.enabled,missingFields,execute:()=>readiness.probeProvider(provider,{db})});
    return Response.json({ok:true,result},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return Response.json({ok:false,code:error.code||'OWNED_SITE_PROBE_FAILED',error:readiness.publicError(error)},{status:error.status||502,headers:{'Cache-Control':'no-store'}});}
}

module.exports={handleProbe};
