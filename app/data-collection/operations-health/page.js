import {renderDashboardRoute} from '../../page.js';
export const dynamic='force-dynamic';
export default function OperationsHealthPage({searchParams}){return renderDashboardRoute('collection',searchParams,{workspace:'operations-health'});}
