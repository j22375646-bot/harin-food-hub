import {renderDashboardRoute} from '../dashboard-route.js';

export const dynamic='force-dynamic';

export default function Page({searchParams}){
  return renderDashboardRoute('calendar',searchParams);
}
