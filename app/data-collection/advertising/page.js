import {renderDashboardRoute} from '../../dashboard-route.js';
import {redirectLegacySystemWorkspace} from '../route-mode.js';

export const dynamic='force-dynamic';

export default function AdvertisingApiPage({searchParams}){
  redirectLegacySystemWorkspace('advertising');
  return renderDashboardRoute('collection',searchParams,{workspace:'advertising'});
}
