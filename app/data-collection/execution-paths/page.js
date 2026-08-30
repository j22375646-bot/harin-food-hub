import {renderDashboardRoute} from '../../dashboard-route.js';
import {redirectLegacySystemWorkspace} from '../route-mode.js';

export const dynamic='force-dynamic';

export default function ExecutionPathsPage({searchParams}){
  redirectLegacySystemWorkspace('execution-paths');
  return renderDashboardRoute('collection',searchParams,{workspace:'execution-paths'});
}
