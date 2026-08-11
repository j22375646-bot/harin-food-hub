'use strict';
require('dotenv').config({path:'.env.local'});
require('dotenv').config({path:'.env'});
const fs=require('node:fs');
const importer=require('../lib/coupang/ad-file-import.js');

(async()=>{for(const file of process.argv.slice(2)){const result=await importer.importAdFile({buffer:fs.readFileSync(file),fileName:require('node:path').basename(file)});console.log(JSON.stringify(result));}})().catch(error=>{console.error(error);process.exit(1);});
