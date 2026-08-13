'use strict';

const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path:path.join(root,'.env'), quiet:true });
require('dotenv').config({ path:path.join(root,'.env.coupang.local'), override:false, quiet:true });
require('dotenv').config({ path:path.join(root,'.env.local'), override:false, quiet:true });
const epostClient = require('../lib/epost/client.js');

async function main() {
  const offices = await epostClient.listOffices();
  process.stdout.write(`${JSON.stringify({ count:offices.length, offices })}\n`);
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ ok:false, code:error.code || 'EPOST_OFFICE_LOOKUP_FAILED', error:error.message })}\n`);
  process.exitCode = 1;
});
