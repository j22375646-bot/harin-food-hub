'use strict';

// A seeded zero row is not evidence that the product is free.
function isProductCostReady(row) {
  if (!row) return false;
  const values=[row.unit_cost,row.packaging_cost,row.other_unit_cost];
  if(values.some(value=>value==null||value===''||!Number.isFinite(Number(value))||Number(value)<0))return false;
  return values.some(value=>Number(value)>0)
    || Boolean(row.zero_cost_confirmed===true&&row.zero_cost_evidence&&row.zero_cost_confirmed_at);
}
module.exports={isProductCostReady};
