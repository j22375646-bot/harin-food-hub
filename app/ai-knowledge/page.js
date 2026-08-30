import {renderDashboardRoute} from '../dashboard-route.js';
import supabaseModule from '../../lib/cafe24/supabase.js';
import knowledgeSnapshot from '../../lib/ai/phase28-knowledge-snapshot.js';
import phase28Adapters from '../../lib/ui/phase28-adapters/index.js';
import featureFlagsModule from '../../lib/ui/phase28-production-runtime.js';
import Phase28KnowledgePage from '../_phase28/pages/knowledge-page.js';

export const dynamic='force-dynamic';

export default async function Page({searchParams}){
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'knowledge'});
  if(!phase28Runtime.activePages.includes('knowledge'))return renderDashboardRoute('knowledge',searchParams);
  try{
    const snapshot=await knowledgeSnapshot.loadPhase28KnowledgeSnapshot({db:supabaseModule.getSupabase(),now:new Date()});
    return <Phase28KnowledgePage model={phase28Adapters.buildPhase28KnowledgeModel(snapshot)}/>;
  }catch(error){
    return <Phase28KnowledgePage model={phase28Adapters.buildPhase28KnowledgeModel({generatedAt:null,error:error.message})}/>;
  }
}
