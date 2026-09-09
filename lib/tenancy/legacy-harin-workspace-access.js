'use strict';
const {authorizeAction}=require('./permissions.js');

// Legacy operational tables do not yet carry tenant_id. Until that migration,
// only the owner of this immutable Harin workspace may read them.
const LEGACY_HARIN_TENANT='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
function assertLegacyHarinWorkspaceOwner(context,requestedTenantId){
 authorizeAction(context,'workspace.read');
 if(context.tenantId!==requestedTenantId||context.tenantId!==LEGACY_HARIN_TENANT||context.role!=='OWNER'){
  throw Object.assign(Error('Denied'),{code:'TENANT_ACCESS_DENIED'});
 }
}
module.exports={LEGACY_HARIN_TENANT,assertLegacyHarinWorkspaceOwner};
