import {renderDashboardRoute} from '../../page.js';

export const dynamic='force-dynamic';

export default function AdvertisingApiPage({searchParams}){
  return renderDashboardRoute('collection',searchParams,{workspace:'advertising'});
}
