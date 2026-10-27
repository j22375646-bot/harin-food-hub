'use strict';
const path=require('node:path');
globalThis.createRecoveryCollection=options=>require(path.join(process.env.MOAON_TEST_RUNTIME_ROOT,'order-collection.cjs')).createOrderCollection(options);
require('./read-budget-bootstrap.cjs');
