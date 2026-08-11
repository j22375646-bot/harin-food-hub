const ExcelJS = require('exceljs');

function value(cell) {
  const input = cell.value;
  if (input == null) return null;
  if (input instanceof Date) return input.toISOString();
  if (typeof input === 'object') return input.text ?? input.result ?? input.hyperlink ?? JSON.stringify(input);
  return input;
}

(async () => {
  for (const file of process.argv.slice(2)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);
    console.log(`\nFILE ${file.split(/[\\/]/).pop()}`);
    for (const sheet of workbook.worksheets) {
      console.log(`SHEET ${sheet.name} rows=${sheet.rowCount} cols=${sheet.columnCount}`);
      for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 12); rowNumber += 1) {
        const values = [];
        for (let column = 1; column <= sheet.columnCount; column += 1) values.push(value(sheet.getCell(rowNumber, column)));
        if (values.some(item => item != null && String(item).trim())) console.log(`${rowNumber}: ${JSON.stringify(values)}`);
      }
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
