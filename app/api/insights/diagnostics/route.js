import authModule from '../../../../lib/dashboard-auth.js';
import supabaseModule from '../../../../lib/cafe24/supabase.js';
import apiSafety from '../../../../lib/api/safety.js';
import diagnosisSnapshotModule from '../../../../lib/reports/phase28-diagnosis-snapshot.js';
import diagnosesAdapter from '../../../../lib/ui/phase28-adapters/diagnoses.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request){
  const session=await authModule.validateSession(authModule.cookieValue(request)).catch(()=>null);
  if(!session)return apiSafety.unauthorized();
  try{
    const snapshot=await diagnosisSnapshotModule.loadPhase28DiagnosisSnapshot({
      db:supabaseModule.getSupabase(),now:new Date(),latestLimit:96,versionLimit:0,platform:'NAVER',reportTypes:['WEEKLY']
    });
    const model=diagnosesAdapter.buildPhase28DiagnosesModel(snapshot);
    const naverWeeklyItems=model.items.filter(item=>item.platform==='NAVER'&&item.reportType==='WEEKLY');
    const items=naverWeeklyItems.map(item=>({
      id:item.id,platform:item.platform,reportType:item.reportType,reportTypeLabel:item.reportTypeLabel,
      title:item.title,periodLabel:item.periodLabel,state:item.state,stateLabel:item.stateLabel,
      lastCalculatedLabel:item.lastCalculatedLabel
    }));
    return apiSafety.json({
      ok:true,
      diagnostics:{
        generatedAt:model.generatedAt,
        dataStatus:model.dataStatus,
        summary:{stored:items.length,ready:naverWeeklyItems.filter(item=>item.state==='READY').length,blocked:naverWeeklyItems.filter(item=>item.state!=='READY').length,versions:null},
        items,
        schedule:model.schedule,
        policy:model.policy
      }
    });
  }catch(error){
    console.error('[insights diagnostics]',error);
    return apiSafety.json({ok:false,error:'누적 진단을 불러오지 못했습니다.'},{status:500});
  }
}
