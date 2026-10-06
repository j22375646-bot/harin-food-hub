'use strict';
const fs=require('node:fs'),path=require('node:path');
const meta=JSON.parse(fs.readFileSync('D:/GPT/tmp/updater-bundle-meta.json','utf8')),packages=new Map();
for(const file of Object.keys(meta.inputs)){
 let dir=path.dirname(path.resolve(file));
 while(dir!==path.dirname(dir)){
  if(fs.existsSync(path.join(dir,'package.json'))){packages.set(dir,JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')));break;}
  dir=path.dirname(dir);
 }
}
const parts=['Bundled Windows updater dependencies. Generated using esbuild 0.25.12 from electron-updater 6.8.9.'];
for(const [dir,pkg] of [...packages].sort(([a],[b])=>a.localeCompare(b))){
 parts.push(`\n=== ${pkg.name} ${pkg.version} (${pkg.license||'see package'}) ===\n`);
 for(const file of fs.readdirSync(dir).sort())if(/^(license|licence|copying|notice)/i.test(file)&&fs.statSync(path.join(dir,file)).isFile())parts.push(fs.readFileSync(path.join(dir,file),'utf8'));
}
fs.writeFileSync(path.join(__dirname,'../updater-runtime.LICENSE.txt'),parts.join('\n'));
