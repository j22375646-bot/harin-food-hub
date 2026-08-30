import supabaseModule from '../../lib/cafe24/supabase.js';
import validationSnapshotModule from '../../lib/validation/phase28-validation-snapshot.js';
import validationAdapter from '../../lib/ui/phase28-adapters/validation.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28ValidationPage from '../_phase28/pages/validation-page.js';

export const dynamic='force-dynamic';

export default async function Page({searchParams}){
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'validation'});
  if(!phase28Runtime.activePages.includes('validation')){
    const {renderDashboardRoute}=await import('../dashboard-route.js');
    return renderDashboardRoute('validation',searchParams);
  }
  try{
    const snapshot=await validationSnapshotModule.loadPhase28ValidationSnapshot({db:supabaseModule.getSupabase(),now:new Date()});
    return <Phase28ValidationPage model={validationAdapter.buildPhase28ValidationModel(snapshot)}/>;
  }catch(error){
    return <Phase28ValidationPage model={validationAdapter.buildPhase28ValidationModel({generatedAt:null,error:error.message})}/>;
  }
}
