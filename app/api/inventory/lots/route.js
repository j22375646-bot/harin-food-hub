import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import lotCenter from '../../../../lib/inventory/lot-center.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function ownerSession(request){
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  return session&&authModule.roleAtLeast(session,'OWNER')?session:null;
}
function ownerRequired(){return apiSafety.json({ok:false,error:'사장님 권한이 필요합니다.'},{status:403});}

export async function GET(request){
  const session=ownerSession(request);
  if(!session)return apiSafety.isAuthorized(request,authModule)?ownerRequired():apiSafety.unauthorized();
  try{
    const {data,error}=await supabaseModule.getSupabase().from('inventory_lots').select('*').order('expires_on',{ascending:true}).order('updated_at',{ascending:false}).limit(500);
    if(error)throw error;
    return apiSafety.json({ok:true,lots:data||[]});
  }catch(error){return apiSafety.json({ok:false,error:error.message||'유통기한 LOT 조회 실패'},{status:500});}
}

export async function PUT(request){
  const session=ownerSession(request);
  if(!session)return apiSafety.isAuthorized(request,authModule)?ownerRequired():apiSafety.unauthorized();
  try{
    const body=await apiSafety.readJson(request);
    const payload={...lotCenter.normalizeLotInput(body),updated_by:authModule.actor(session)};
    const db=supabaseModule.getSupabase();
    const [product,inventory]=await Promise.all([
      db.from('coupang_product_items').select('vendor_item_id,status').eq('vendor_item_id',payload.vendor_item_id).maybeSingle(),
      db.from('coupang_rg_inventory').select('vendor_item_id,total_orderable_quantity,sales_last_30_days').eq('vendor_item_id',payload.vendor_item_id).gt('total_orderable_quantity',0).gt('sales_last_30_days',0).maybeSingle()
    ]);
    if(product.error)throw product.error;
    if(inventory.error)throw inventory.error;
    if(!product.data||!inventory.data)return apiSafety.json({ok:false,error:'현재 판매 중인 로켓그로스 상품만 LOT를 기록할 수 있습니다.'},{status:409});
    const saved=await db.from('inventory_lots').upsert(payload,{onConflict:'platform,vendor_item_id,lot_code'}).select('*').single();
    if(saved.error)throw saved.error;
    return apiSafety.json({ok:true,lot:saved.data,message:'입고 LOT와 유통기한을 저장했습니다.'});
  }catch(error){
    if(error?.status)return apiSafety.json({ok:false,error:error.message,code:error.code},{status:error.status});
    return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'유통기한 LOT 저장 실패'},{status:500});
  }
}
