import {renderDashboardRoute} from '../../page.js';
import {redirectLegacySystemWorkspace} from '../route-mode.js';

export const dynamic='force-dynamic';

export default function OptionalProvidersPage({searchParams}){
  redirectLegacySystemWorkspace('optional-providers');
  return renderDashboardRoute('collection',searchParams,{workspace:'optional-providers'});
}
