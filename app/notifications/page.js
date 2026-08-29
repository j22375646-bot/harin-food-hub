import {renderDashboardRoute} from '../page.js';
import supabaseModule from '../../lib/cafe24/supabase.js';
import notificationSnapshotModule from '../../lib/notifications/phase28-snapshot.js';
import phase28Adapters from '../../lib/ui/phase28-adapters/index.js';
import featureFlagsModule from '../../lib/ui/feature-flags.js';
import Phase28NotificationsPage from '../_phase28/pages/notifications-page.js';

export const dynamic='force-dynamic';

export default async function Page({searchParams}){
  const phase28Runtime=featureFlagsModule.phase28RuntimeConfig(process.env,{routeId:'notifications'});
  if(!phase28Runtime.activePages.includes('notifications'))return renderDashboardRoute('notifications',searchParams);
  try{
    const snapshot=await notificationSnapshotModule.loadPhase28NotificationSnapshot({db:supabaseModule.getSupabase(),now:new Date()});
    return <Phase28NotificationsPage model={phase28Adapters.buildPhase28NotificationsModel(snapshot)}/>;
  }catch(error){
    return <Phase28NotificationsPage model={phase28Adapters.buildPhase28NotificationsModel({generatedAt:null,alerts:[],error:error.message})}/>;
  }
}
