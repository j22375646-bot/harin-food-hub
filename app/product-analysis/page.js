import supabaseModule from '../../lib/cafe24/supabase.js';
import productAnalysisSnapshotModule from '../../lib/analytics/phase28-product-analysis-snapshot.js';
import phase28Adapters from '../../lib/ui/phase28-adapters/index.js';
import Phase28ProductAnalysisPage from '../_phase28/pages/product-analysis-page.js';

export const dynamic='force-dynamic';

export default async function Page(){
  const snapshot=await productAnalysisSnapshotModule.loadPhase28ProductAnalysisSnapshot({db:supabaseModule.getSupabase(),now:new Date()});
  return <Phase28ProductAnalysisPage model={phase28Adapters.buildPhase28ProductAnalysisModel(snapshot)}/>;
}
