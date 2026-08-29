'use client';

export default function Phase28App({initialData,initialState}) {
  const routeId=initialData.phase28Runtime?.routeId||'home';
  return (
    <main data-phase28-root="true" data-phase28-route={routeId} data-legacy-view={initialState.view}>
      <p>V106 앱 준비 중</p>
    </main>
  );
}
