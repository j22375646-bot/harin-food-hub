import { renderDashboardRoute } from '../../page.js';
import {redirectLegacySystemWorkspace} from '../route-mode.js';

export const dynamic = 'force-dynamic';

export default function NaverApiPage({ searchParams }) {
  redirectLegacySystemWorkspace('naver-api');
  return renderDashboardRoute('collection', searchParams, { workspace:'naver-api' });
}
