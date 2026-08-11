'use strict';
require('dotenv').config({path:'.env.local'});
require('dotenv').config({path:'.env'});
const scheduler=require('../lib/automation/report-scheduler.js');

(async()=>{
  const periods=[
    {period:{start:'2026-07-01',end:'2026-07-31'},reportType:'MONTHLY',mode:'FILE_IMPORT_INITIAL'},
    {period:{start:'2026-08-01',end:'2026-08-10'},reportType:'ADHOC',mode:'FILE_IMPORT_INITIAL'}
  ];
  for(const options of periods){
    const result=await scheduler.generatePlatformSet({...options,deduplicate:true});
    console.log(JSON.stringify({period:options.period,reportType:options.reportType,reports:result.reports.map(item=>({platform:item.platform,ok:item.ok,created:item.created,error:item.error}))}));
  }
})().catch(error=>{console.error(error);process.exit(1);});
