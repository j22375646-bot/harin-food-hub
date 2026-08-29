import {renderDashboardRoute} from '../../page.js';
import {redirectLegacySystemWorkspace} from '../route-mode.js';

export const dynamic='force-dynamic';

export default function AdvertisingApiPage({searchParams}){
  redirectLegacySystemWorkspace();
  return renderDashboardRoute('collection',searchParams,{workspace:'advertising'});
}
