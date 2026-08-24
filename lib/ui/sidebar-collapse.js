'use strict';

function resolveSidebarGroupAction({collapsed=false,groupId,expanded=false,hasQuery=false}={}) {
  if(collapsed)return {collapsed:false,openGroup:groupId};
  return {
    collapsed:false,
    openGroup:expanded&&!hasQuery?null:groupId
  };
}

function sidebarRootState(collapsed) {
  return collapsed?'collapsed':'expanded';
}

module.exports={resolveSidebarGroupAction,sidebarRootState};
