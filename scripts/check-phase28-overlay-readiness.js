'use strict';

const routes=require('../lib/ui/phase28-route-registry.js');
const hub=require('../lib/navigation/hub-routes.js');
const {buildPhase28Readiness}=require('../lib/ui/phase28-readiness.js');

const report=buildPhase28Readiness({
  routes:routes.PHASE28_ROUTES,
  hubNav:hub.HUB_NAV,
  hubWorkspaces:hub.HUB_WORKSPACES,
  env:process.env,
  availableAdapters:[]
});

process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
if(report.foundation!=='READY')process.exitCode=1;
