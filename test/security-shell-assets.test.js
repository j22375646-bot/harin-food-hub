'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const config=fs.readFileSync(path.join(root,'next.config.js'),'utf8');

async function globalCspFor(nodeEnv) {
  const configPath=path.join(root,'next.config.js');
  const previous=process.env.NODE_ENV;
  process.env.NODE_ENV=nodeEnv;
  delete require.cache[require.resolve(configPath)];
  try{
    const loaded=require(configPath);
    const rules=await loaded.headers();
    return rules.find(rule=>rule.source==='/:path*').headers.find(header=>header.key==='Content-Security-Policy').value;
  }finally{
    if(previous===undefined)delete process.env.NODE_ENV;
    else process.env.NODE_ENV=previous;
    delete require.cache[require.resolve(configPath)];
  }
}

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

test('development CSP supports React debugging without weakening production',async()=>{
  const development=await globalCspFor('development');
  const production=await globalCspFor('production');
  assert.match(development,/script-src[^;]*'unsafe-eval'/);
  assert.doesNotMatch(production,/script-src[^;]*'unsafe-eval'/);
});
