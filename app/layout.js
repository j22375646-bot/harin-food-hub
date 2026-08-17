import './globals.css';
import './_design-system/harin-v8.css';
import './_design-system/harin-page-frame.css';
import './_shell/harin-shell-v8.css';
import './_main/harin-main-v8.css';
import './_operations/harin-operations-v8.css';
import './_analysis/harin-analysis-v8.css';
import './_execution/harin-execution-v8.css';
import './_reliability/harin-reliability-v8.css';
import './_reliability/harin-naver-api-center.css';
import './_workspace/harin-owner-workspace.css';
import './_ai/harin-ai-page-v8.css';
import './_shell/harin-entry-v8.css';
import './_analysis/harin-market-intelligence.css';
import './_design-system/harin-readability-v8.css';
import uiFlags from '../lib/ui/feature-flags.js';

export const metadata = {
  title: '하린식품 광고·매출 진단 허브',
  description: 'Cafe24 주문, 매출, 방문과 유입경로를 한눈에 확인하는 하린식품 통합 허브'
};

export default function RootLayout({ children }) {
  const ui=uiFlags.harinUiConfig();
  return <html lang="ko" data-harin-ui={ui.version} data-harin-rollback={ui.rollbackFlag}><body className={ui.bodyClass}>{children}</body></html>;
}
