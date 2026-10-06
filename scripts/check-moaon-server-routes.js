'use strict';
// A successful web build alone does not prove compatibility with installed apps.
// Check actual emitted routes before Vercel can publish the server bundle.
const fs=require('node:fs'),path=require('node:path');
const required=[
 '/api/moaon/businesses','/api/moaon/connections','/api/moaon/credentials','/api/moaon/team',
 ...['orders','cs','inventory','finance','settlement','stock','assistant','insights','insights/ai','keyword-bids','market-ai','general-chat'].map(name=>'/api/moaon/businesses/[tenantId]/'+name),
 ...['access','automation','read','worker'].map(name=>'/api/moaon/assistant/'+name),
];
function check(manifest){
 const missing=required.filter(route=>typeof manifest?.[route+'/route']!=='string');
 if(missing.length)throw Error('Moaon server routes missing: '+missing.join(', '));
 return required.length;
}
if(require.main===module){
 try{const manifest=JSON.parse(fs.readFileSync(path.join(process.env.NEXT_DIST_DIR||'.next','server','app-paths-manifest.json'),'utf8'));console.log('Moaon server routes verified: '+check(manifest));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={check,required};
