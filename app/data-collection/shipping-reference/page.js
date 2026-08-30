import {renderDashboardRoute} from '../../dashboard-route.js';
import {redirectLegacySystemWorkspace} from '../route-mode.js';
export const dynamic='force-dynamic';
export default function ShippingReferencePage({searchParams}){redirectLegacySystemWorkspace('shipping-reference');return renderDashboardRoute('collection',searchParams,{workspace:'shipping-reference'});}
