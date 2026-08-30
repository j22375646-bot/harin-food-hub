import {renderDashboardRoute} from '../page.js';
import supabaseModule from '../../lib/cafe24/supabase.js';
import changesSnapshotModule from '../../lib/changes/phase28-changes-snapshot.js';
import naverBidExecutionModule from '../../lib/naver/bid-execution.js';
import phase28Adapters from '../../lib/ui/phase28-adapters/index.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28ChangesPage from '../_phase28/pages/changes-page.js';

export const dynamic='force-dynamic';

export default async function Page({searchParams}){
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'changes'});
  if(!phase28Runtime.activePages.includes('changes'))return renderDashboardRoute('changes',searchParams);
  try{
    const snapshot=await changesSnapshotModule.loadPhase28ChangesSnapshot({db:supabaseModule.getSupabase(),now:new Date(),naverWriteEnabled:naverBidExecutionModule.configuration().write_enabled});
    return <Phase28ChangesPage model={phase28Adapters.buildPhase28ChangesModel(snapshot)}/>;
  }catch(error){
    return <Phase28ChangesPage model={phase28Adapters.buildPhase28ChangesModel({generatedAt:null,requests:[],audits:[],error:error.message})}/>;
  }
}
