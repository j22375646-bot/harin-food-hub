'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const args=process.argv.slice(2);
const sourceIndex=args.indexOf('--source');
if(sourceIndex<0||!args[sourceIndex+1])throw new Error('--source 절대경로가 필요합니다.');

const sourceRoot=path.resolve(args[sourceIndex+1]);
const targetRoot=path.resolve(__dirname,'..','docs','design-reference','phase28-v106');
const sourceFiles=[
  'index.html',
  'DESIGN-BASELINE.md',
  'phase28-panel-motion.css',
  'phase28-v82-fixed-design.css',
  'phase28-v83-channel-logos.css',
  'phase28-v83-channel-logos.js',
  'detail-polish-v106.css',
  'orders-integrated.css',
  'orders-integrated.js',
  'cs-integrated.css',
  'cs-integrated.js',
  'inventory-products-integrated.css',
  'inventory-products-integrated.js',
  'keyword-integrated.css',
  'keyword-integrated.js',
  'product-analysis-v95.css',
  'product-analysis-integrated.js',
  'settlement-visual-v99.css',
  'settlement-visual-v99.js',
  'insights-v100.css',
  'insights-v100.js',
  'product-development-v101.css',
  'product-development-v101.js',
  'system-operations-v102.css',
  'system-operations-v102.js',
  'notifications-v103.css',
  'notifications-v103.js',
  'decision-loop-v104.css',
  'decision-loop-v104.js',
  'ai-knowledge-v105.css',
  'ai-knowledge-v105.js'
];
const screenshots=[
  'v106-home-desktop.png',
  'v82-home-fixed-mobile390.png',
  'v82-home-fixed-dark.png'
];
const copied=[];

function copy(relativeSource,relativeTarget){
  const from=path.join(sourceRoot,relativeSource);
  const to=path.join(targetRoot,relativeTarget);
  if(!fs.existsSync(from))throw new Error(`V106 기준 파일 누락: ${relativeSource}`);
  fs.mkdirSync(path.dirname(to),{recursive:true});
  fs.copyFileSync(from,to);
  const buffer=fs.readFileSync(to);
  copied.push({
    path:relativeTarget.replaceAll('\\','/'),
    sha256:crypto.createHash('sha256').update(buffer).digest('hex'),
    bytes:buffer.byteLength
  });
}

for(const file of sourceFiles)copy(file,path.join('source',file));
for(const file of screenshots)copy(file,path.join('screenshots',file));
copied.sort((left,right)=>left.path.localeCompare(right.path));
fs.writeFileSync(
  path.join(targetRoot,'manifest.json'),
  `${JSON.stringify({version:'V106',generatedAt:new Date().toISOString(),files:copied},null,2)}\n`
);

process.stdout.write(`V106 기준 파일 ${copied.length}개를 고정했습니다.\n`);
