import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ownerSession(request) {
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  if(!session)return { error:apiSafety.unauthorized() };
  if(!authModule.roleAtLeast(session,'OWNER'))return { error:apiSafety.json({ok:false,error:'사장님 권한이 필요합니다.'},{status:403}) };
  return { session };
}

export async function POST(request) {
  const access=ownerSession(request);
  if(access.error)return access.error;
  try {
    const body=await apiSafety.readJson(request,{maxBytes:12*1024});
    const keywordId=String(body.ncc_keyword_id||'').trim();
    const productId=body.master_product_id==null?'':String(body.master_product_id).trim();
    if(!/^nkw-[A-Za-z0-9-]+$/.test(keywordId))return apiSafety.json({ok:false,error:'네이버 키워드 ID가 올바르지 않습니다.'},{status:400});
    if(productId&&!/^[0-9a-f-]{36}$/i.test(productId))return apiSafety.json({ok:false,error:'판매상품 ID가 올바르지 않습니다.'},{status:400});
    const db=supabaseModule.getSupabase();
    const [keyword,pending]=await Promise.all([
      db.from('naver_keywords').select('ncc_keyword_id,keyword').eq('ncc_keyword_id',keywordId).maybeSingle(),
      db.from('financial_change_requests').select('id,status').eq('change_type','NAVER_BID').eq('target_key',keywordId).in('status',['PREVIEWED','APPROVED','EXECUTING']).limit(1)
    ]);
    if(keyword.error)throw keyword.error;
    if(pending.error)throw pending.error;
    if(!keyword.data)return apiSafety.json({ok:false,error:'저장된 네이버 키워드를 찾을 수 없습니다.'},{status:404});
    if(pending.data?.length)return apiSafety.json({ok:false,error:'승인 또는 실행 중인 입찰안이 있어 상품 연결을 바꿀 수 없습니다.',code:'ACTIVE_BID_CHANGE'},{status:409});
    if(!productId){
      const removed=await db.from('naver_keyword_product_links').delete().eq('ncc_keyword_id',keywordId);
      if(removed.error)throw removed.error;
      return apiSafety.json({ok:true,linked:false,ncc_keyword_id:keywordId});
    }
    const [product,target]=await Promise.all([
      db.from('master_products').select('id,name,is_active').eq('id',productId).maybeSingle(),
      db.from('product_ad_targets').select('master_product_id,target_profit_margin_rate,updated_at').eq('master_product_id',productId).maybeSingle()
    ]);
    if(product.error)throw product.error;
    if(target.error)throw target.error;
    if(!product.data||product.data.is_active===false)return apiSafety.json({ok:false,error:'판매 중인 기준상품만 연결할 수 있습니다.'},{status:409});
    const linkedBy=authModule.actor(access.session);
    const saved=await db.from('naver_keyword_product_links').upsert({ncc_keyword_id:keywordId,master_product_id:productId,linked_by:linkedBy},{onConflict:'ncc_keyword_id'}).select('ncc_keyword_id,master_product_id,linked_by,updated_at').single();
    if(saved.error)throw saved.error;
    return apiSafety.json({ok:true,linked:true,link:saved.data,product:{id:product.data.id,name:product.data.name},product_target_ready:Boolean(target.data),next_action:target.data?'RECALCULATE':'SET_PRODUCT_AD_TARGET'});
  } catch(error) {
    return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'상품 연결을 저장하지 못했습니다.'},{status:500});
  }
}
