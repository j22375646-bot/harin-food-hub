'use strict';

const operationSnapshotModule=require('../navigation/operation-snapshot.js');

function buildPhase28ClientPayload({dashboardData={},phase28Runtime={},phase28={},aiPanelKey=null}={}) {
  const selectedAiPanel=aiPanelKey?dashboardData.aiPagePanels?.[aiPanelKey]:null;
  return {
    generatedAt:dashboardData.generatedAt||null,
    navigationSnapshot:operationSnapshotModule.buildNavigationOperationSnapshot(dashboardData),
    phase28Runtime,
    phase28,
    aiPagePanels:selectedAiPanel?{[aiPanelKey]:selectedAiPanel}:{}
  };
}

module.exports={buildPhase28ClientPayload};
