'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fingerprintReference}=require('../lib/ui/phase28-reference-integrity');

const root=path.resolve(__dirname,'..');
const referenceRoot=path.join(root,'docs','design-reference','phase28-v106');

test('V106 reference snapshot is complete and hash-verified',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(referenceRoot,'manifest.json'),'utf8'));
  assert.equal(manifest.version,'V106');
  assert.ok(manifest.files.length>=20);
  for(const entry of manifest.files){
    const absolute=path.join(referenceRoot,entry.path);
    const buffer=fs.readFileSync(absolute);
    const fingerprint=fingerprintReference(entry.path,buffer);
    assert.equal(fingerprint.bytes,entry.bytes,entry.path);
    assert.equal(fingerprint.sha256,entry.sha256,entry.path);
  }
  for(const required of [
    'source/index.html',
    'source/DESIGN-BASELINE.md',
    'source/phase28-panel-motion.css',
    'source/detail-polish-v106.css',
    'screenshots/v106-home-desktop.png'
  ])assert.ok(manifest.files.some(entry=>entry.path===required),required);
});

test('V106 text fingerprints are stable across Windows and Unix line endings',()=>{
  const unix=Buffer.from('.card {\n  color: navy;\n}\n','utf8');
  const windows=Buffer.from('.card {\r\n  color: navy;\r\n}\r\n','utf8');
  assert.deepEqual(
    fingerprintReference('source/sample.css',windows),
    fingerprintReference('source/sample.css',unix)
  );
});
