export default function Loading() {
  return <main className="routeLoading" aria-live="polite" aria-busy="true">
    <div className="routeLoadingMark">H</div>
    <strong>화면을 여는 중이에요</strong>
    <span>필요한 자료만 불러오고 있습니다.</span>
    <div className="routeLoadingBar"><i /></div>
  </main>;
}
