'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { parseCostWorkbook } = require('../lib/coupang/cost-file-import.js');

(async () => {
  for (const filePath of process.argv.slice(2)) {
    const parsed = await parseCostWorkbook(await fs.readFile(filePath), path.basename(filePath));
    const totals = parsed.transactions.reduce((sum, row) => ({ rows: sum.rows + 1, sales: sum.sales + row.gross_sales, cost: sum.cost + row.cost_amount, vat: sum.vat + row.cost_vat, credit: sum.credit + row.credit_amount }), { rows: 0, sales: 0, cost: 0, vat: 0, credit: 0 });
    console.log(JSON.stringify({ file: path.basename(filePath), sheets: parsed.sheets, invalidRows: parsed.invalidRows, totals }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
