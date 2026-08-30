import {renderDashboardRoute} from '../../page.js';
import {redirectLegacySystemWorkspace} from '../route-mode.js';

export const dynamic='force-dynamic';

export default function OwnedSiteApiPage({searchParams}){
  redirectLegacySystemWorkspace('owned-site');
  return renderDashboardRoute('collection',searchParams,{workspace:'owned-site'});
}
