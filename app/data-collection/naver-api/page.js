import { renderDashboardRoute } from '../../page.js';

export const dynamic = 'force-dynamic';

export default function NaverApiPage({ searchParams }) {
  return renderDashboardRoute('collection', searchParams, { workspace:'naver-api' });
}
