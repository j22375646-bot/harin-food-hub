import {renderDashboardRoute} from '../page.js';
import supabaseModule from '../../lib/cafe24/supabase.js';
import experimentsSnapshot from '../../lib/experiments/phase28-experiments-snapshot.js';
import phase28Adapters from '../../lib/ui/phase28-adapters/index.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28ExperimentsPage from '../_phase28/pages/experiments-page.js';

export const dynamic='force-dynamic';

export default async function Page({searchParams}){
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'experiments'});
  if(!phase28Runtime.activePages.includes('experiments'))return renderDashboardRoute('experiments',searchParams);
  const params=await searchParams;
  const masterProductId=Array.isArray(params?.master_product_id)?params.master_product_id[0]:params?.master_product_id;
  try{
    const snapshot=await experimentsSnapshot.loadPhase28ExperimentsSnapshot({db:supabaseModule.getSupabase(),masterProductId,now:new Date()});
    return <Phase28ExperimentsPage model={phase28Adapters.buildPhase28ExperimentsModel(snapshot)}/>;
  }catch(error){
    return <Phase28ExperimentsPage model={phase28Adapters.buildPhase28ExperimentsModel({generatedAt:null,error:error.message})}/>;
  }
}
