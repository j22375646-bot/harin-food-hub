const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('installer downloads are publicly accessible without exposing private paths',()=>{
 const source=fs.readFileSync('proxy.js','utf8');const fn=source.slice(source.indexOf('function isPublic('),source.indexOf('function apiDenied('));
 const isPublic=vm.runInNewContext(fn+';isPublic');
 const installer=fs.readFileSync('public/integrations/install-moaon-automation.sh','utf8');
 const urls=[...installer.matchAll(/https:\/\/harin-cafe24-sync\.vercel\.app(\/integrations\/[^ \n]+)/g)].map(x=>x[1]);
 assert.ok(urls.length>10);for(const url of urls)assert.equal(isPublic(url),true,url);
 for(const url of ['/integrations/read.key','/integrations/.env','/integrations/private.py','/api/private','/assistant'])assert.equal(isPublic(url),false,url);
});
