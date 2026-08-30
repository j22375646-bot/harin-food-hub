import supabaseModule from '../../lib/cafe24/supabase.js';
import projectsModule from '../../lib/market-intelligence/projects.js';
import developmentAdapter from '../../lib/ui/phase28-adapters/development.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28DevelopmentPage from '../_phase28/pages/development-page.js';
import MarketProjectHome from './project-home.js';

export const dynamic='force-dynamic';

export default async function Page({searchParams}){
  const params=await searchParams;
  const requested=Array.isArray(params?.master_product_id)?params.master_product_id[0]:params?.master_product_id;
  const initialProductId=String(requested||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,100);
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'development'});
  try{
    const data={...await projectsModule.loadProjectHome({db:supabaseModule.getSupabase()}),generatedAt:new Date().toISOString(),initialProductId};
    if(phase28Runtime.activePages.includes('development'))return <Phase28DevelopmentPage model={developmentAdapter.buildPhase28DevelopmentModel(data)}/>;
    return <MarketProjectHome initialData={data} initialProductId={initialProductId}/>;
  }catch(error){
    const fallback={products:[],projects:[],summary:{saleable_products:0,active_projects:0,versions:0,experiments:0,completed_products:0},generatedAt:null,error:error.message,initialProductId};
    if(phase28Runtime.activePages.includes('development'))return <Phase28DevelopmentPage model={developmentAdapter.buildPhase28DevelopmentModel(fallback)}/>;
    return <MarketProjectHome initialData={fallback} initialProductId={initialProductId}/>;
  }
}
