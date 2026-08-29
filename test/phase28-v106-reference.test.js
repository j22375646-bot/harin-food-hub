'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const referenceRoot=path.join(root,'docs','design-reference','phase28-v106');

test('V106 reference snapshot is complete and hash-verified',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(referenceRoot,'manifest.json'),'utf8'));
  assert.equal(manifest.version,'V106');
  assert.ok(manifest.files.length>=20);
  for(const entry of manifest.files){
    const absolute=path.join(referenceRoot,entry.path);
    const buffer=fs.readFileSync(absolute);
    assert.equal(buffer.byteLength,entry.bytes,entry.path);
    assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'),entry.sha256,entry.path);
  }
  for(const required of [
    'source/index.html',
    'source/DESIGN-BASELINE.md',
    'source/phase28-panel-motion.css',
    'source/detail-polish-v106.css',
    'screenshots/v106-home-desktop.png'
  ])assert.ok(manifest.files.some(entry=>entry.path===required),required);
});
