import supabaseModule from '../../lib/cafe24/supabase.js';
import projectsModule from '../../lib/market-intelligence/projects.js';
import MarketProjectHome from './project-home.js';

export const dynamic='force-dynamic';

export default async function Page(){
  try{
    const data=await projectsModule.loadProjectHome({db:supabaseModule.getSupabase()});
    return <MarketProjectHome initialData={data}/>;
  }catch(error){
    return <MarketProjectHome initialData={{products:[],projects:[],summary:{saleable_products:0,active_projects:0,versions:0,experiments:0,completed_products:0},error:error.message}}/>;
  }
}
