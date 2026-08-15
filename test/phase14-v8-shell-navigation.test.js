'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('14-2 loads an isolated shell layer and extracts navigation from the page renderer',()=>{
  const layout=read('app/layout.js');
  const client=read('app/dashboard-client.js');
  const shell=read('app/_shell/harin-app-shell.js');
  assert.match(layout,/import '.\/_shell\/harin-shell-v8\.css'/);
  for(const component of ['HarinTopbar','HarinSidebar','HarinMobileNavigation','HarinBreadcrumbBar','HarinFocusedWorkspaceNav']){
    assert.match(shell,new RegExp(`export function ${component}`));
    assert.match(client,new RegExp(`<${component}`));
  }
  assert.doesNotMatch(client,/function SidebarMenu|function MobileMoreMenu/);
  assert.match(shell,/14-9 · 빠른 업무 공간/);
});

test('14-2 keeps real URL navigation, prefetch, back restoration, and focused route links',()=>{
  const client=read('app/dashboard-client.js');
  const shell=read('app/_shell/harin-app-shell.js');
  assert.match(client,/window\.addEventListener\('popstate',syncFromAddress\)/);
  assert.match(client,/router\[replace\|\|current===href\?'replace':'push'\]\(href,\{scroll:false\}\)/);
  assert.match(client,/router\.prefetch\(hubRoutesModule\.buildHubHref/);
  assert.match(shell,/<Link className=\{workspace===item\.id\?'active':''\}/);
  assert.match(shell,/hubRoutesModule\.buildHubHref/);
});

test('14-2 mobile More is a controlled accessible bottom sheet',()=>{
  const shell=read('app/_shell/harin-app-shell.js');
  const css=read('app/_shell/harin-shell-v8.css');
  assert.match(shell,/const \[menuOpen,setMenuOpen\]=useState\(false\)/);
  assert.match(shell,/aria-expanded=\{menuOpen\}/);
  assert.match(shell,/role="dialog" aria-modal="true"/);
  assert.match(shell,/event\.key==='Escape'/);
  assert.match(shell,/document\.body\.style\.overflow='hidden'/);
  assert.match(shell,/requestAnimationFrame\(\(\)=>closeButtonRef\.current\?\.focus\(\)\)/);
  assert.doesNotMatch(shell,/removeAttribute\('open'\)/);
  assert.match(css,/max-height:min\(76dvh,700px\)/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('14-2 derives the connection label from actual channel readiness',()=>{
  const client=read('app/dashboard-client.js');
  assert.match(client,/initialData\.channelConnections\?\.channels\|\|\[\]/);
  assert.match(client,/\['READ_READY','WRITE_READY'\]\.includes\(item\.status\)/);
  assert.match(client,/connectionLabel=\{connectionLabel\}/);
  assert.doesNotMatch(client,/Cafe24 연결됨/);
});
