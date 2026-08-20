import '../_shell/harin-entry-v8.css';
import { HarinIcon } from './harin-icon.js';

export function HarinLoadingScreen({
  title='화면을 차근차근 준비하고 있어요',
  description='필요한 자료만 골라서 불러오고 있습니다.'
}) {
  return <main className="routeLoading" aria-live="polite" aria-busy="true">
    <section className="routeLoadingCard" role="status">
      <div className="routeLoadingVisual" aria-hidden="true">
        <span className="routeLoadingOrbit"><i/><i/><i/></span>
        <span className="routeLoadingMark"><HarinIcon name="sparkles" size={25}/></span>
      </div>
      <span className="routeLoadingEyebrow">HARIN WORKSPACE</span>
      <strong>{title}</strong>
      <p>{description}</p>
      <div className="routeLoadingBar" aria-hidden="true"><i /></div>
      <div className="routeLoadingTasks" aria-hidden="true">
        <span><HarinIcon name="orders"/>주문</span>
        <span><HarinIcon name="inventory"/>재고</span>
        <span><HarinIcon name="analysis"/>분석</span>
      </div>
    </section>
  </main>;
}

export function HarinRouteSkeleton({
  title='필요한 내용을 불러오고 있어요',
  description='허브 메뉴는 그대로 두고 이 화면의 내용만 준비합니다.'
}) {
  return <section className="routePartialSkeleton" role="status" aria-live="polite" aria-busy="true">
    <header>
      <span aria-hidden="true"><HarinIcon name="sparkles" size={19}/></span>
      <div><b>{title}</b><small>{description}</small></div>
    </header>
    <div className="routePartialSkeletonMetrics" aria-hidden="true"><i/><i/><i/></div>
    <div className="routePartialSkeletonBody" aria-hidden="true"><i/><i/><i/><i/></div>
  </section>;
}

export default HarinLoadingScreen;
