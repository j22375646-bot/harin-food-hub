import auth from '../../../../lib/dashboard-auth.js';
import safety from '../../../../lib/api/safety.js';
import supabase from '../../../../lib/cafe24/supabase.js';
import calendar from '../../../../lib/calendar/calendar-center.js';
import performance from '../../../../lib/calendar/event-performance.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
 if(!safety.isAuthorized(request,auth))return safety.unauthorized();
 const url=new URL(request.url),id=url.searchParams.get('id');
 if(!/^[0-9a-f-]{36}$/i.test(id||'')||[...url.searchParams.keys()].length!==1)return safety.json({ok:false},{status:400});
 try{const db=supabase.getSupabase(),result=await db.from('hub_work_items').select('id,title,body,due_at,context_label,item_type,status').eq('id',id).eq('context_href','/calendar').maybeSingle();if(result.error)throw result.error;if(!result.data||result.data.status==='ARCHIVED')return safety.json({ok:false},{status:404});const event=calendar.decorateEntry(result.data);if(event.type!=='EVENT'||event.eventConfigInvalid)return safety.json({ok:false},{status:400});return safety.json({ok:true,...await performance.load(db,event)});}catch{return safety.json({ok:false},{status:503});}
}
