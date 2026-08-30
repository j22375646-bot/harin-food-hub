'use strict';

const operationSnapshotModule=require('../navigation/operation-snapshot.js');

function buildPhase28ClientPayload({dashboardData={},phase28Runtime={},phase28={},aiPanelKey=null,fallbackNavigationSnapshot=null}={}) {
  const selectedAiPanel=aiPanelKey?dashboardData.aiPagePanels?.[aiPanelKey]:null;
  const currentNavigationSnapshot=operationSnapshotModule.buildNavigationOperationSnapshot(dashboardData);
  const verifiedFallback=operationSnapshotModule.parseNavigationOperationSnapshot(fallbackNavigationSnapshot);
  return {
    generatedAt:dashboardData.generatedAt||null,
    navigationSnapshot:operationSnapshotModule.selectNavigationOperationSnapshot(currentNavigationSnapshot,verifiedFallback),
    phase28Runtime,
    phase28,
    aiPagePanels:selectedAiPanel?{[aiPanelKey]:selectedAiPanel}:{}
  };
}

module.exports={buildPhase28ClientPayload};
