'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cafe24Client = require('../lib/cafe24/client.js');

test('Cafe24 POST and PUT writes keep shop_no in the JSON body, not the query string', () => {
  const config = { mallId:'harin48291', shopNo:1 };
  const request = {
    tracking_no:'1234567890123',
    shipping_company_code:'0012',
    status:'shipping'
  };

  for (const method of ['POST', 'PUT']) {
    const spec = cafe24Client.buildAdminWriteRequest(config, method, '/orders/C-1/shipments', request);
    assert.equal(spec.url.search, '');
    assert.equal(spec.options.method, method);
    assert.deepEqual(spec.options.body, { shop_no:1, request });
  }
});
