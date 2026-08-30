import {renderDashboardRoute} from '../page.js';
import supabaseModule from '../../lib/cafe24/supabase.js';
import systemSnapshotModule from '../../lib/system/phase28-snapshot.js';
import phase28Adapters from '../../lib/ui/phase28-adapters/index.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28SystemPage from '../_phase28/pages/system-page.js';

export const dynamic='force-dynamic';

export default async function Page({searchParams}){
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'system'});
  if(!phase28Runtime.activePages.includes('system'))return renderDashboardRoute('collection',searchParams);
  try{
    const snapshot=await systemSnapshotModule.loadPhase28SystemSnapshot({db:supabaseModule.getSupabase(),env:process.env,now:new Date()});
    return <Phase28SystemPage model={phase28Adapters.buildPhase28SystemModel(snapshot)}/>;
  }catch(error){
    const model=phase28Adapters.buildPhase28SystemModel({generatedAt:null,services:[],jobs:[],recovery:{},error:error.message});
    return <Phase28SystemPage model={model}/>;
  }
}
