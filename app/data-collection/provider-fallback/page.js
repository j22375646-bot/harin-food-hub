import {renderDashboardRoute} from '../../page.js';

export const dynamic='force-dynamic';

export default function ProviderFallbackPage({searchParams}){
  return renderDashboardRoute('collection',searchParams,{workspace:'provider-fallback'});
}
