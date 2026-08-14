import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import cafe24Catalog from '../../../../lib/products/cafe24-catalog.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  try {
    const db = supabaseModule.getSupabase();
    const sourceResult = await db.from('cafe24_products').select('external_product_no,product_name,price,display,selling,raw_data').limit(5000);
    if (sourceResult.error) throw sourceResult.error;
    const result = await cafe24Catalog.reconcileCafe24Catalog({ db, products:sourceResult.data || [] });
    return Response.json({ ok:true, ...result });
  } catch(error) { return Response.json({ok:false,error:error.message},{status:500}); }
}
