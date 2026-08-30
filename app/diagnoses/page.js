import supabaseModule from '../../lib/cafe24/supabase.js';
import diagnosisSnapshotModule from '../../lib/reports/phase28-diagnosis-snapshot.js';
import diagnosesAdapter from '../../lib/ui/phase28-adapters/diagnoses.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28DiagnosesPage from '../_phase28/pages/diagnoses-page.js';

export const dynamic='force-dynamic';

export default async function Page({searchParams}){
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'diagnoses'});
  if(!phase28Runtime.activePages.includes('diagnoses')){
    const {renderDashboardRoute}=await import('../dashboard-route.js');
    return renderDashboardRoute('reports',searchParams);
  }
  try{
    const snapshot=await diagnosisSnapshotModule.loadPhase28DiagnosisSnapshot({db:supabaseModule.getSupabase(),now:new Date()});
    return <Phase28DiagnosesPage model={diagnosesAdapter.buildPhase28DiagnosesModel(snapshot)}/>;
  }catch(error){
    return <Phase28DiagnosesPage model={diagnosesAdapter.buildPhase28DiagnosesModel({generatedAt:null,latestReports:[],versionHeaders:[],error:error.message})}/>;
  }
}
