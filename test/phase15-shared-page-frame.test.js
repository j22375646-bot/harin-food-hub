const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('15-2 provides one readable shared page hierarchy and responsive styles',()=>{
  const ui=read('app/_design-system/harin-ui.js');
  const css=read('app/_design-system/harin-page-frame.css');
  const layout=read('app/layout.js');
  for(const component of ['HarinPageFrame','HarinPageHeader','HarinPageToolbar','HarinPageContent','HarinPageAiRegion'])assert.match(ui,new RegExp(`export function ${component}`));
  assert.match(layout,/harin-page-frame\.css/);
  assert.match(css,/\.v8PageHeaderMetrics/);
  assert.match(css,/\.v8PageToolbar/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test('15-2 applies the shared frame to operations growth and execution pages',()=>{
  const pages=[
    'app/_analysis/harin-analysis-workbench.js',
    'app/_execution/harin-execution-workbench.js',
    'app/unified-orders-center.js',
    'app/unified-customer-service-center.js',
    'app/unified-inventory-operations-center.js',
    'app/unified-settlement-operations-center.js'
  ];
  for(const file of pages){
    const source=read(file);
    assert.match(source,/HarinPageFrame/);
    assert.match(source,/HarinPageHeader/);
    assert.match(source,/HarinPageAiRegion/);
  }
});

test('15-2 keeps page AI independent and places it after the working content',()=>{
  const checks=[
    ['app/_analysis/harin-analysis-workbench.js','analysisPageContent'],
    ['app/_execution/harin-execution-workbench.js','executionPageContent'],
    ['app/unified-orders-center.js','unifiedOrderList'],
    ['app/unified-customer-service-center.js','unifiedCsWorkList'],
    ['app/unified-inventory-operations-center.js','inventoryOpsList'],
    ['app/unified-settlement-operations-center.js','SettlementWaterfall']
  ];
  for(const [file,contentMarker] of checks){
    const source=read(file);
    assert.ok(source.lastIndexOf('HarinPageAiRegion')>source.lastIndexOf(contentMarker),`${file} should render its AI region after the working content`);
    assert.match(source,/id="page-ai-analysis"/);
  }
  assert.doesNotMatch(read('app/dashboard-client.js'),/aiPagePanels\?\.(?:insight|keyword|product)\s*\|\|/);
});

test('15-2 removes duplicate summary strips from CS inventory and settlement',()=>{
  assert.doesNotMatch(read('app/unified-customer-service-center.js'),/className="kpiGrid"/);
  assert.doesNotMatch(read('app/unified-inventory-operations-center.js'),/className="inventoryOpsKpis"/);
  assert.doesNotMatch(read('app/unified-settlement-operations-center.js'),/className="settlementOpsKpis"/);
});
