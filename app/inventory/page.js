import { renderDashboardRoute } from '../page.js';
export const dynamic='force-dynamic';
export default function Page({searchParams}){return renderDashboardRoute('inventory',searchParams);}
