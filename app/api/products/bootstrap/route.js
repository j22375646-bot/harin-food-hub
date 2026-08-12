import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  try {
    const db = supabaseModule.getSupabase();
    const [sourceResult, channelsResult] = await Promise.all([
      db.from('cafe24_products').select('external_product_no,product_name,price,selling,raw_data'),
      db.from('channel_products').select('external_product_id,master_product_id').eq('platform','CAFE24')
    ]);
    if (sourceResult.error) throw sourceResult.error;
    if (channelsResult.error) throw channelsResult.error;
    const existing = new Set((channelsResult.data || []).map(row => row.external_product_id));
    const missing = (sourceResult.data || []).filter(product => !existing.has(product.external_product_no));
    if (!missing.length) return Response.json({ok:true,created:0,linked:channelsResult.data?.length||0,total:sourceResult.data?.length||0});
    const masters = missing.map(product => ({ name:product.product_name, selling_price:product.price, is_active:product.selling !== false }));
    const mastersResult = await db.from('master_products').insert(masters).select('id');
    if (mastersResult.error) throw mastersResult.error;
    const channelRows = missing.map((product,index)=>({ master_product_id:mastersResult.data[index].id, platform:'CAFE24', external_product_id:product.external_product_no, external_product_name:product.product_name, selling_price:product.price, is_active:product.selling !== false, raw_data:product.raw_data, match_method:'SOURCE', match_confidence:1, matched_at:new Date().toISOString(), matched_by:'SYSTEM' }));
    const channelResult = await db.from('channel_products').upsert(channelRows,{onConflict:'platform,external_product_id'});
    if (channelResult.error) throw channelResult.error;
    return Response.json({ok:true,created:missing.length,linked:(channelsResult.data?.length||0)+missing.length,total:sourceResult.data?.length||0});
  } catch(error) { return Response.json({ok:false,error:error.message},{status:500}); }
}
