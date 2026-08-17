import {renderDashboardRoute} from '../../page.js';
export const dynamic='force-dynamic';
export default function ShippingReferencePage({searchParams}){return renderDashboardRoute('collection',searchParams,{workspace:'shipping-reference'});}
