import {renderDashboardRoute} from '../../page.js';

export const dynamic='force-dynamic';

export default function OptionalProvidersPage({searchParams}){
  return renderDashboardRoute('collection',searchParams,{workspace:'optional-providers'});
}
