import {renderDashboardRoute} from '../page.js';
import supabaseModule from '../../lib/cafe24/supabase.js';
import validationSnapshotModule from '../../lib/validation/phase28-validation-snapshot.js';
import phase28Adapters from '../../lib/ui/phase28-adapters/index.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28ValidationPage from '../_phase28/pages/validation-page.js';

export const dynamic='force-dynamic';

export default async function Page({searchParams}){
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'validation'});
  if(!phase28Runtime.activePages.includes('validation'))return renderDashboardRoute('validation',searchParams);
  try{
    const snapshot=await validationSnapshotModule.loadPhase28ValidationSnapshot({db:supabaseModule.getSupabase(),now:new Date()});
    return <Phase28ValidationPage model={phase28Adapters.buildPhase28ValidationModel(snapshot)}/>;
  }catch(error){
    return <Phase28ValidationPage model={phase28Adapters.buildPhase28ValidationModel({generatedAt:null,error:error.message})}/>;
  }
}
