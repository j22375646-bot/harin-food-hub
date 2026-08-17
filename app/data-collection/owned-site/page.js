import {renderDashboardRoute} from '../../page.js';

export const dynamic='force-dynamic';

export default function OwnedSiteApiPage({searchParams}){
  return renderDashboardRoute('collection',searchParams,{workspace:'owned-site'});
}
