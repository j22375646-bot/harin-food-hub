import authModule from '../../../../lib/dashboard-auth.js';
import apiSafety from '../../../../lib/api/safety.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import analysisContracts from '../../../../lib/ai/analysis-contracts.js';
import pageResults from '../../../../lib/ai/page-results.js';
import privacy from '../../../../lib/ai/privacy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELECT_FIELDS='id,analysis_type,page_key,status,result_mode,data_status,period_label,formula_version,result,created_at,model,knowledge_versions';

function ownerSession(request){
  const token=apiSafety.cookieValue(request,authModule.COOKIE_NAME);
  const session=authModule.parseSession(token);
  if(!session)return {error:apiSafety.unauthorized()};
  if(!authModule.roleAtLeast(session,'OWNER'))return {error:apiSafety.json({ok:false,error:'OWNER 권한이 필요합니다.'},{status:403})};
  return {session};
}

export async function GET(request){
  if(!apiSafety.isAuthorized(request,authModule))return apiSafety.unauthorized();
  try{
    const page=new URL(request.url).searchParams.get('page');
    const analysisType=page?pageResults.analysisTypeForPage(page):null;
    let query=supabaseModule.getSupabase().from('ai_analysis_results').select(SELECT_FIELDS)
      .not('page_key','is',null).order('created_at',{ascending:false}).limit(page?1:30);
    if(page)query=query.eq('page_key',page).eq('analysis_type',analysisType);
    const found=await query;
    if(found.error)throw found.error;
    const records=(found.data||[]).map(pageResults.publicRecord);
    return apiSafety.json({ok:true,records,latest:page?records[0]||null:pageResults.latestByPage(found.data||[])});
  }catch(error){
    console.error('[ai page results get]',error);
    return apiSafety.json({ok:false,error:error.message||'AI 분석 결과를 불러오지 못했습니다.'},{status:500});
  }
}

export async function POST(request){
  const access=ownerSession(request);
  if(access.error)return access.error;
  try{
    const body=await apiSafety.readJson(request,{maxBytes:24*1024});
    const snapshot=authModule.verifyAiSnapshot(body.snapshot_token);
    if(!snapshot)return apiSafety.json({ok:false,error:'분석 자료가 만료되었거나 변경되었습니다. 화면을 새로고침해주세요.',code:'INVALID_AI_SNAPSHOT'},{status:409});
    privacy.assertNoPii(snapshot);
    const checked=analysisContracts.validateAnalysisEnvelope(snapshot);
    if(snapshot.schema_version!==pageResults.PREVIEW_VERSION||snapshot.formula_version!==pageResults.PREVIEW_VERSION){
      return apiSafety.json({ok:false,error:'현재 미리보기 버전과 맞지 않습니다. 화면을 새로고침해주세요.',code:'INVALID_PREVIEW_VERSION'},{status:409});
    }
    if(snapshot.analysis_type!==pageResults.analysisTypeForPage(checked.envelope.page)){
      return apiSafety.json({ok:false,error:'분석 페이지 정보가 맞지 않습니다.',code:'INVALID_ANALYSIS_TYPE'},{status:400});
    }
    const result=pageResults.previewResult(snapshot,snapshot.preview_context||{});
    const saved=await pageResults.saveServerPreview(supabaseModule.getSupabase(),{
      snapshot,
      result,
      actor:authModule.actor(access.session)
    });
    return apiSafety.json({ok:true,reused:saved.reused,record:saved.record,openai_called:false,cost_krw:0});
  }catch(error){
    console.error('[ai page results post]',error);
    const inputError=apiSafety.inputErrorResponse(error);
    if(inputError)return inputError;
    return apiSafety.json({ok:false,error:error.message||'AI 미리보기를 저장하지 못했습니다.'},{status:500});
  }
}
