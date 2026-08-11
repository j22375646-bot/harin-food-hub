'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
require('dotenv').config({ path: path.join(root, '.env.local'), override: false, quiet: true });
const { importCostFile } = require('../lib/coupang/cost-file-import.js');

(async () => {
  for (const filePath of process.argv.slice(2)) {
    const result = await importCostFile({ buffer: await fs.readFile(filePath), fileName: path.basename(filePath) });
    console.log(JSON.stringify({ file: path.basename(filePath), skipped: result.skipped, counts: result.counts, sourceTypes: result.import?.source_types, totals: result.totals }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
