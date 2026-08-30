import { notFound } from 'next/navigation';
import hubRoutes from '../../../lib/navigation/hub-routes.js';
import { renderDashboardRoute } from '../../dashboard-route.js';

export const dynamic='force-dynamic';

export default async function Page({ params, searchParams }) {
  const { workspace }=await params;
  if(!(hubRoutes.HUB_WORKSPACES.keyword||[]).some(item=>item.id===workspace))notFound();
  return renderDashboardRoute('keyword',searchParams,{workspace});
}
