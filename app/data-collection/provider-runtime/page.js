import {renderDashboardRoute} from '../../page.js';
import {redirectLegacySystemWorkspace} from '../route-mode.js';

export const dynamic='force-dynamic';

export default function ProviderRuntimePage({searchParams}){
  redirectLegacySystemWorkspace('provider-runtime');
  return renderDashboardRoute('collection',searchParams,{workspace:'provider-runtime'});
}
