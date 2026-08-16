'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('현재 애플리케이션 버전은 변경 이력과 배포 절차에 기록된다',()=>{
  const root=path.resolve(__dirname,'..');
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const changelog=fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8');
  const process=fs.readFileSync(path.join(root,'docs','RELEASE_PROCESS.md'),'utf8');
  assert.match(pkg.version,/^\d+\.\d+\.\d+$/);
  assert.match(changelog,new RegExp(`## \\[${pkg.version.replace(/\./g,'\\.')}\\]`));
  assert.match(process,/git tag -a v\$VERSION/);
  assert.match(process,/harin-cafe24-sync\.vercel\.app/);
});
