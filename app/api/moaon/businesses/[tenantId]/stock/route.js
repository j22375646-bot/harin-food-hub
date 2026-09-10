import stock from '../../../../../../lib/stock/runtime.js';
import supabase from '../../../../../../lib/cafe24/supabase.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const service=stock.createStockRuntime({db:{from:(...args)=>supabase.getSupabase().from(...args),rpc:(...args)=>supabase.getSupabase().rpc(...args)}});
export async function GET(request){return service.handle(request);}
export async function POST(request){return service.handle(request);}
