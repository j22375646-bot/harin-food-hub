import {renderDashboardRoute} from '../../dashboard-route.js';
import {redirectLegacySystemWorkspace} from '../route-mode.js';
export const dynamic='force-dynamic';
export default function OperationsHealthPage({searchParams}){redirectLegacySystemWorkspace('operations-health');return renderDashboardRoute('collection',searchParams,{workspace:'operations-health'});}
