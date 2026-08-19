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
  try{
    const db=supabaseModule.getSupabase(),syncResult=await syncModule.syncSearchTermsLogged(db,30);
    const [rowsResult,keywordsResult]=await Promise.all([
      db.from('naver_search_terms').select('id,period_start,period_end,ncc_adgroup_id,search_term,impressions,clicks,cost,conversions,conversion_revenue,classification_auto,classification_override,classification_confidence,recommended_action,action_reason,action_status,is_registered_exact,owner_note,collected_at').order('period_end',{ascending:false}).order('period_start',{ascending:false}).order('cost',{ascending:false}).limit(500),
      db.from('naver_keywords').select('ncc_keyword_id,keyword').limit(5000)
    ]);
    if(rowsResult.error)throw rowsResult.error;if(keywordsResult.error)throw keywordsResult.error;
    const allRows=rowsResult.data||[],newest=allRows[0]||null,period=newest?{period_start:newest.period_start,period_end:newest.period_end}:null;
    const rows=period?allRows.filter(item=>item.period_start===period.period_start&&item.period_end===period.period_end):[];
    const center=searchTermCenter.buildSearchTermCenter({rows,registeredKeywords:keywordsResult.data||[],period,collectionTotal:syncResult.rows});
    return Response.json({ok:true,...syncResult,center},{headers:{'Cache-Control':'no-store'}});
  }
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
