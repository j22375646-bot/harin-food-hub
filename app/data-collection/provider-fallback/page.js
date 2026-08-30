import {renderDashboardRoute} from '../../dashboard-route.js';
import {redirectLegacySystemWorkspace} from '../route-mode.js';

export const dynamic='force-dynamic';

export default function ProviderFallbackPage({searchParams}){
  redirectLegacySystemWorkspace('provider-fallback');
  return renderDashboardRoute('collection',searchParams,{workspace:'provider-fallback'});
}
