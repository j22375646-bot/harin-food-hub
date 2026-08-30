import Phase28HomeApp from './_phase28/phase28-home-app.js';
import supabaseModule from '../lib/cafe24/supabase.js';
import authModule from '../lib/dashboard-auth.js';
import hubRoutesModule from '../lib/navigation/hub-routes.js';
import featureFlagsModule from '../lib/ui/phase28-production-runtime.js';
import phase28MainAdapter from '../lib/ui/phase28-adapters/main.js';
import phase28ClientPayloadModule from '../lib/ui/phase28-client-payload.js';
import operationSnapshotModule from '../lib/navigation/operation-snapshot.js';
import mainLoaderModule from '../lib/dashboard/phase28-main-loader.js';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';

export const dynamic='force-dynamic';

export default async function Home({searchParams}){
  const initialState=hubRoutesModule.normalizeHubState(await searchParams);
  if(initialState.view!=='main')redirect(hubRoutesModule.buildHubHref(initialState));
  const cookieStore=await cookies();
  const currentUser=await authModule.validateSession(cookieStore.get(authModule.COOKIE_NAME)?.value).catch(()=>null);
  if(!currentUser)redirect('/login');
  const phase28Runtime=featureFlagsModule.phase28RuntimeForState(process.env,initialState);
  if(!phase28Runtime.activePages.includes('home'))redirect('/dashboard');
  const fallbackNavigationSnapshot=operationSnapshotModule.parseNavigationOperationSnapshotCookie(
    cookieStore.get(operationSnapshotModule.NAVIGATION_SNAPSHOT_COOKIE)?.value
  );
  try{
    const dashboardData=await mainLoaderModule.loadPhase28MainDashboard({db:supabaseModule.getSupabase()});
    const phase28={main:phase28MainAdapter.buildPhase28MainModel(dashboardData),adapter_status:'READY'};
    const initialData=phase28ClientPayloadModule.buildPhase28ClientPayload({
      dashboardData,phase28Runtime,phase28,aiPanelKey:'main',fallbackNavigationSnapshot
    });
    return <Phase28HomeApp initialData={initialData}/>;
  }catch(error){
    return <Phase28HomeApp initialData={{error:error.message,phase28Runtime}}/>;
  }
}
