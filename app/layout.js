import './globals.css';
import './_design-system/harin-brand-tokens.css';
import './_design-system/harin-v8.css';
import './_design-system/harin-page-frame.css';
import './_design-system/harin-bulk-selection.css';
import './_shell/harin-shell-v8.css';
import './_design-system/harin-readability-v8.css';
import './_design-system/harin-interactions-v8.css';
import uiFlags from '../lib/ui/feature-flags.js';

export const metadata = {
  title: '하린식품 광고·매출 진단 허브',
  description: 'Cafe24 주문, 매출, 방문과 유입경로를 한눈에 확인하는 하린식품 통합 허브'
};

const themeBootstrap="try{var t=localStorage.getItem('harin-hub-theme');if(t==='dark'||t==='light')document.documentElement.dataset.harinTheme=t}catch(e){}";

export default function RootLayout({ children }) {
  const ui=uiFlags.harinUiConfig();
  return <html lang="ko" data-harin-ui={ui.version} data-harin-rollback={ui.rollbackFlag} data-harin-health-version="23-8" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeBootstrap}}/></head><body className={ui.bodyClass}>{children}</body></html>;
}
