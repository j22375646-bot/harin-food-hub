import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = {
  LOWER_BID:{ label:'입찰가 감액 검토', recommendation:'입찰가를 낮춘 뒤 7일 동안 주문 변화를 확인' },
  PAUSE:{ label:'키워드 중지 검토', recommendation:'검색 의도와 상품 연결을 확인한 뒤 중지 여부를 최종 결정' },
  WATCH:{ label:'7일 관찰', recommendation:'현재 운영을 유지하고 7일 동안 표본을 더 수집' }
};

function cookieValue(request) {
  return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');
}

const number = value => Number(value || 0);

export async function POST(request) {
  if (!authModule.verifySession(cookieValue(request))) return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  try {
    const body = await request.json();
    const rawItems = Array.isArray(body.items) ? body.items : [body];
    const items = rawItems.slice(0, 20).map(item => ({
      keyword_id:String(item.keyword_id || '').trim(),
      keyword:String(item.keyword || '').trim(),
      action_type:String(item.action_type || '').toUpperCase(),
      cost:number(item.cost),
      conversion_revenue:number(item.conversion_revenue),
      clicks:number(item.clicks),
      conversions:number(item.conversions)
    })).filter(item => item.keyword_id && item.keyword && ACTIONS[item.action_type]);
    if (!items.length) return Response.json({ ok:false, error:'등록할 키워드 실행계획이 없습니다.' }, { status:400 });

    const db = supabaseModule.getSupabase();
    const targetIds = [...new Set(items.map(item => item.keyword_id))];
    const { data:existing, error:existingError } = await db.from('actions').select('target_id,action_type').eq('platform','NAVER').eq('target_type','KEYWORD').eq('status','PLANNED').in('target_id',targetIds);
    if (existingError) throw existingError;
    const existingKeys = new Set((existing || []).map(item => `${item.target_id}:${item.action_type}`));
    const unique = [...new Map(items.map(item => [`${item.keyword_id}:${item.action_type}`,item])).values()];
    const pending = unique.filter(item => !existingKeys.has(`${item.keyword_id}:${item.action_type}`));
    const reviewAfter = new Date(Date.now() + 7 * 86400000).toISOString();
    const rows = pending.map(item => ({
      platform:'NAVER',
      target_type:'KEYWORD',
      target_id:item.keyword_id,
      target_name:item.keyword,
      action_type:item.action_type,
      status:'PLANNED',
      review_after:reviewAfter,
      before_value:{ cost:item.cost, conversion_revenue:item.conversion_revenue, clicks:item.clicks, conversions:item.conversions, roas:item.cost ? item.conversion_revenue / item.cost * 100 : 0 },
      after_value:{ recommendation:ACTIONS[item.action_type].recommendation },
      reason:`${ACTIONS[item.action_type].label} · 최근 7일 광고비 ${Math.round(item.cost).toLocaleString('ko-KR')}원 · 전환매출 ${Math.round(item.conversion_revenue).toLocaleString('ko-KR')}원`
    }));
    if (rows.length) {
      const { error } = await db.from('actions').insert(rows);
      if (error) throw error;
    }
    return Response.json({ ok:true, created:rows.length, existing:unique.length-rows.length, total:unique.length });
  } catch (error) {
    console.error('[naver keyword actions]', error);
    return Response.json({ ok:false, error:error.message || '실행계획 등록 실패' }, { status:500 });
  }
}
