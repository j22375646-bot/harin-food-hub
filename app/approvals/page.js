import supabaseModule from '../../lib/cafe24/supabase.js';
import changesSnapshotModule from '../../lib/changes/phase28-changes-snapshot.js';
import naverBidExecutionModule from '../../lib/naver/bid-execution.js';
import changesAdapter from '../../lib/ui/phase28-adapters/changes.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28ChangesPage from '../_phase28/pages/changes-page.js';

export const dynamic='force-dynamic';

export default async function Page({searchParams}){
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'changes'});
  if(!phase28Runtime.activePages.includes('changes')){
    const {renderDashboardRoute}=await import('../dashboard-route.js');
    return renderDashboardRoute('changes',searchParams);
  }
  try{
    const snapshot=await changesSnapshotModule.loadPhase28ChangesSnapshot({db:supabaseModule.getSupabase(),now:new Date(),naverWriteEnabled:naverBidExecutionModule.configuration().write_enabled});
    return <Phase28ChangesPage model={changesAdapter.buildPhase28ChangesModel(snapshot)}/>;
  }catch(error){
    return <Phase28ChangesPage model={changesAdapter.buildPhase28ChangesModel({generatedAt:null,requests:[],audits:[],error:error.message})}/>;
  }
}
