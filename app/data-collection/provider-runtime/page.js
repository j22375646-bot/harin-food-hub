import {renderDashboardRoute} from '../../page.js';

export const dynamic='force-dynamic';

export default function ProviderRuntimePage({searchParams}){
  return renderDashboardRoute('collection',searchParams,{workspace:'provider-runtime'});
}
