'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('15-8 lazy-mounts closed heavy drawers while preserving opened state',()=>{
  const source=read('app/_design-system/harin-ui.js');
  assert.match(source,/const \[contentMounted,setContentMounted\]=useState\(Boolean\(defaultOpen\)\|\|!lazy\)/);
  assert.match(source,/if\(nextOpen&&!contentMounted\)setContentMounted\(true\)/);
  assert.match(source,/data-content-mounted=\{contentMounted\?'true':'false'\}/);
  assert.match(source,/contentMounted\?<div className="v8ProgressiveDetailsBody">\{children\}<\/div>:null/);
});

test('15-8 gives focused workspace links immediate pending feedback and eager prefetch',()=>{
  const shell=read('app/_shell/harin-app-shell.js');
  const dashboard=read('app/dashboard-client.js');
  assert.match(shell,/pendingWorkspace/);
  assert.match(shell,/<Link prefetch href=/);
  assert.match(shell,/onNavigate\?\.\(item\.id\)/);
  assert.match(dashboard,/const \[pendingWorkspace,setPendingWorkspace\]=useState\(null\)/);
  assert.match(dashboard,/className=\{`hubMain\$\{viewIsLoading\?' routePending':''\}`\}/);
  assert.match(dashboard,/aria-busy=\{viewIsLoading\?'true':'false'\}/);
});

test('15-8 bounds the CS work list to 20 rows and resets on every filter',()=>{
  const source=read('app/unified-customer-service-center.js');
  assert.match(source,/const \[visibleCount, setVisibleCount\] = useState\(20\)/);
  assert.match(source,/useEffect\(\(\) => setVisibleCount\(20\), \[workspace, platform, kind, due, query\]\)/);
  assert.match(source,/const visibleRows = rows\.slice\(0, visibleCount\)/);
  assert.match(source,/CS 20건 더 보기/);
});

test('15-8 mobile shell and route feedback stay usable without horizontal clipping',()=>{
  const shellCss=read('app/_shell/harin-shell-v8.css');
  const frameCss=read('app/_design-system/harin-page-frame.css');
  const globalCss=read('app/globals.css');
  assert.match(shellCss,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(shellCss,/max-height:min\(76dvh,700px\)/);
  assert.match(frameCss,/v8ProgressiveDetailsBody\{overflow-x:auto/);
  assert.match(globalCss,/\.hubMain\.routePending>:not\(\.viewLoadingRibbon\)\{opacity:\.56;pointer-events:none/);
  assert.match(globalCss,/\.harinV8 \.hubMain\.routePending>:not\(\.viewLoadingRibbon\)\{opacity:\.72\}/);
  assert.match(globalCss,/\.unifiedCsMore\{width:100%\}/);
});

test('15-8 retains channel-separated keyword UI and page-specific AI slots',()=>{
  const dashboard=read('app/dashboard-client.js');
  assert.match(dashboard,/view==='keyword'\?\[\['naver'/);
  assert.match(dashboard,/\['coupang','coupangDot','쿠팡'\]/);
  assert.doesNotMatch(dashboard,/view==='keyword'\?\[\['all'/);
  for(const page of ['orders','cs','inventory','settlement','keyword','product'])assert.match(dashboard,new RegExp(`aiPagePanels\\?\\.${page}`));
});

test('15-8 exposes one repeatable final verification command',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['verify:phase15'],'pnpm test && pnpm build');
});
