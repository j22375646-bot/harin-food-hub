'use strict';

const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path:path.join(root, '.env'), quiet:true });
require('dotenv').config({ path:process.env.DOTENV_CONFIG_PATH || path.join(root, '.env.local'), override:false, quiet:true });

const calibrationModule = require('../lib/analytics/cost-calibration.js');
const { getSupabase } = require('../lib/cafe24/supabase.js');

async function main() {
  const result = await calibrationModule.refreshCoupangCostCalibration({ db:getSupabase(), triggerType:'DASHBOARD' });
  console.log(JSON.stringify({
    id:result.id,
    status:result.status,
    confidence:result.confidence,
    commissionRate:result.commission.actualRate,
    commissionOrders:result.commission.orders,
    shippingCost:result.logistics.actualPerOrder,
    logisticsOrders:result.logistics.orders,
    periodStart:result.period_start,
    periodEnd:result.period_end
  }, null, 2));
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
