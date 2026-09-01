import { notFound, redirect } from 'next/navigation';
import hubRoutes from '../../../lib/navigation/hub-routes.js';
import { renderDashboardRoute } from '../../dashboard-route.js';

export const dynamic='force-dynamic';

export default async function Page({ params, searchParams }) {
  const { workspace }=await params;
  if(workspace==='causes')redirect('/insights/overview');
  if(workspace==='channels'||workspace==='profitability')redirect('/insights/overview');
  const currentWorkspaces=new Set((hubRoutes.HUB_WORKSPACES.insight||[]).map(item=>item.id));
  if(!currentWorkspaces.has(workspace))notFound();
  return renderDashboardRoute('insight',searchParams,{phase28Workspace:workspace});
}
