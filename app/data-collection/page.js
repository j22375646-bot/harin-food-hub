import supabaseModule from '../../lib/cafe24/supabase.js';
import systemSnapshotModule from '../../lib/system/phase28-snapshot.js';
import systemAdapter from '../../lib/ui/phase28-adapters/system.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28SystemPage from '../_phase28/pages/system-page.js';

export const dynamic='force-dynamic';

export default async function Page({searchParams}){
  const params=await searchParams;
  const workspace=typeof params?.workspace==='string'?params.workspace:'connections';
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'system'});
  if(!phase28Runtime.activePages.includes('system')){
    const {renderDashboardRoute}=await import('../dashboard-route.js');
    return renderDashboardRoute('collection',params);
  }
  try{
    const snapshot=await systemSnapshotModule.loadPhase28SystemSnapshot({db:supabaseModule.getSupabase(),env:process.env,now:new Date()});
    return <Phase28SystemPage model={systemAdapter.buildPhase28SystemModel(snapshot,{workspace})}/>;
  }catch(error){
    const model=systemAdapter.buildPhase28SystemModel({generatedAt:null,services:[],jobs:[],recovery:{},error:error.message},{workspace});
    return <Phase28SystemPage model={model}/>;
  }
}
