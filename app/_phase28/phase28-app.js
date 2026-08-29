'use client';

import operationSnapshotModule from '../../lib/navigation/operation-snapshot.js';
import Phase28Shell from './phase28-shell.js';

export default function Phase28App({initialData}) {
  const routeId=initialData.phase28Runtime?.routeId||'home';
  const navigationSnapshot=initialData.navigationSnapshot||operationSnapshotModule.buildNavigationOperationSnapshot(initialData);
  const generatedAt=navigationSnapshot?.generatedAt||initialData.generatedAt||null;
  return <Phase28Shell routeId={routeId} badges={navigationSnapshot?.badges||{}} generatedAt={generatedAt}>
    <section data-phase28-root="true" data-phase28-page={routeId} aria-label="Phase 28 페이지 준비 상태">이 페이지의 운영 화면을 준비하고 있어요.</section>
  </Phase28Shell>;
}
