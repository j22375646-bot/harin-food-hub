'use strict';
const {loadNaverMarketing}=require('./naver-marketing-loader.js');
async function loadWorkspaceInsights({db,now=()=>new Date()}={}){
 if(!db||typeof db.from!=='function')throw TypeError('Trusted database required');
 const result=await db.from('reports')
  .select('id,platform,report_type,period_start,period_end,title,status,summary_json,created_at')
  .eq('platform','NAVER').eq('report_type','WEEKLY').eq('is_latest',true)
  .order('period_end',{ascending:false,nullsFirst:false})
  .order('created_at',{ascending:false}).limit(20);
 if(result?.error||!Array.isArray(result?.data))throw Error('Insights unavailable');
 const current=now();
 const [marketing,workbench,searchTerms]=await Promise.all([loadNaverMarketing({db,now:current}).catch(()=>null),require('./keyword-workbench-loader.js').loadKeywordWorkbench(db),require('./keyword-workbench-loader.js').loadKeywordWorkbench(db,'SEARCH_TERMS')]);
 if(marketing){marketing.workbench=workbench;marketing.searchTerms=searchTerms;const c=require('../operations-health/config.js').telegramConfig();marketing.telegram={configured:!!(c.token&&c.chatId),enabled:c.enabled===true,sendingEnabled:c.writesEnabled===true};}
 return {generatedAt:current.toISOString(),reports:result.data,marketing};
}
module.exports={loadWorkspaceInsights};
