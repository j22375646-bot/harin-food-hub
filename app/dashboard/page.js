import {renderDashboardRoute} from '../dashboard-route.js';

export const dynamic='force-dynamic';

export default async function LegacyDashboardPage({searchParams}){
  return renderDashboardRoute('main',searchParams);
}
