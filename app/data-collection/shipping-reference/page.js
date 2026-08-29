import {renderDashboardRoute} from '../../page.js';
import {redirectLegacySystemWorkspace} from '../route-mode.js';
export const dynamic='force-dynamic';
export default function ShippingReferencePage({searchParams}){redirectLegacySystemWorkspace();return renderDashboardRoute('collection',searchParams,{workspace:'shipping-reference'});}
