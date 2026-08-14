import authModule from '../../../../lib/dashboard-auth.js';
import syncModule from '../../../../lib/naver/sync.js';
import searchTermCenter from '../../../../lib/naver/search-term-center.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}
function unauthorized(request){return !authModule.verifySession(cookieValue(request));}

export async function POST(request){
  if(unauthorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{return Response.json({ok:true,...await syncModule.syncSearchTermsLogged(supabaseModule.getSupabase(),30)});}
  catch(error){return Response.json({ok:false,error:error.message},{status:error.status||500});}
}

export async function PATCH(request){
  if(unauthorized(request))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const body=await request.json(),id=String(body.id||'').trim(),classification=String(body.classification||'').trim();
    if(!/^[0-9a-f-]{36}$/i.test(id))return Response.json({ok:false,error:'검색어 항목 ID를 확인해주세요.'},{status:400});
    if(!searchTermCenter.CLASSIFICATIONS.includes(classification))return Response.json({ok:false,error:'검색어 분류값을 확인해주세요.'},{status:400});
    const db=supabaseModule.getSupabase();
    const current=await db.from('naver_search_terms').select('id,search_term,cost,clicks,conversions,is_registered_exact').eq('id',id).maybeSingle();
    if(current.error)throw current.error;if(!current.data)return Response.json({ok:false,error:'검색어 항목을 찾지 못했습니다.'},{status:404});
    const action=searchTermCenter.recommendAction({...current.data,classification_override:classification});
    const update=await db.from('naver_search_terms').update({classification_override:classification,recommended_action:action.action,action_reason:action.reason,action_status:'REVIEWED',owner_note:String(body.note||'').trim().slice(0,500)||null}).eq('id',id).select('id,classification_override,recommended_action,action_reason,action_status').single();
    if(update.error)throw update.error;
    return Response.json({ok:true,item:update.data});
  }catch(error){return Response.json({ok:false,error:error.message},{status:500});}
}
