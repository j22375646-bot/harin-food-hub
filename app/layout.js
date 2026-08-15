import './globals.css';
import './_design-system/harin-v8.css';

export const metadata = {
  title: '하린식품 광고·매출 진단 허브',
  description: 'Cafe24 주문, 매출, 방문과 유입경로를 한눈에 확인하는 하린식품 통합 허브'
};

export default function RootLayout({ children }) {
  return <html lang="ko" data-harin-ui="v8"><body className="harinV8">{children}</body></html>;
}
