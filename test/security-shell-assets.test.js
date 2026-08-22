'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const config=fs.readFileSync(path.join(root,'next.config.js'),'utf8');

test('the global response has a compatible enforcing CSP',()=>{
  assert.match(config,/Content-Security-Policy/);
  assert.match(config,/default-src 'self'/);
  assert.match(config,/object-src 'none'/);
  assert.match(config,/frame-ancestors 'none'/);
  assert.match(config,/img-src 'self' data: blob: https:/);
});

test('the app owns an icon and keeps favicon.ico from returning 404',()=>{
  assert.equal(fs.existsSync(path.join(root,'app','icon.svg')),true);
  assert.match(config,/source:'\/favicon\.ico'/);
  assert.match(config,/destination:'\/icon\.svg'/);
});
