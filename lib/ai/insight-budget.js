'use strict';

function createInsightBudget({store, providerAccountId, pricingVersion}) {
  if (!store?.reserve || !store?.settle) throw new Error('INSIGHT_STORE_REQUIRED');
  return {
    async reserve(input) {
      const account = providerAccountId || input.providerAccountId;
      const pricing = pricingVersion || input.pricingVersion;
      if (!account || !pricing) return {allowed:false,reason:'SETUP_REQUIRED'};
      if (!Number.isFinite(input.maxCostKrw) || input.maxCostKrw<=0 || input.maxCostKrw>30000) return {allowed:false,reason:'BUDGET_BLOCKED'};
      return store.reserve({...input, providerAccountId:account, pricingVersion:pricing, maxCostKrw:Math.ceil(input.maxCostKrw)});
    },
    async settle(input) {
      if (!['SUCCEEDED','FAILED','UNKNOWN'].includes(input.status)) throw new Error('INVALID_STATUS');
      const known = input.status!=='UNKNOWN' && Number.isFinite(input.actualCostKrw) && input.actualCostKrw>=0;
      return store.settle({...input,actualCostKrw:known ? Math.ceil(input.actualCostKrw) : null});
    },
  };
}
module.exports = {createInsightBudget};
