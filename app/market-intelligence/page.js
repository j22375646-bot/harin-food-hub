import supabaseModule from '../../lib/cafe24/supabase.js';
import projectsModule from '../../lib/market-intelligence/projects.js';
import phase28Adapters from '../../lib/ui/phase28-adapters/index.js';
import featureFlagsModule from '../../lib/ui/feature-flags.js';
import Phase28DevelopmentPage from '../_phase28/pages/development-page.js';
import MarketProjectHome from './project-home.js';

export const dynamic='force-dynamic';

export default async function Page(){
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'development'});
  try{
    const data={...await projectsModule.loadProjectHome({db:supabaseModule.getSupabase()}),generatedAt:new Date().toISOString()};
    if(phase28Runtime.activePages.includes('development'))return <Phase28DevelopmentPage model={phase28Adapters.buildPhase28DevelopmentModel(data)}/>;
    return <MarketProjectHome initialData={data}/>;
  }catch(error){
    const fallback={products:[],projects:[],summary:{saleable_products:0,active_projects:0,versions:0,experiments:0,completed_products:0},generatedAt:null,error:error.message};
    if(phase28Runtime.activePages.includes('development'))return <Phase28DevelopmentPage model={phase28Adapters.buildPhase28DevelopmentModel(fallback)}/>;
    return <MarketProjectHome initialData={fallback}/>;
  }
}
