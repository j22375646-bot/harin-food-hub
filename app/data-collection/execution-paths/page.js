import {renderDashboardRoute} from '../../page.js';

export const dynamic='force-dynamic';

export default function ExecutionPathsPage({searchParams}){
  return renderDashboardRoute('collection',searchParams,{workspace:'execution-paths'});
}
