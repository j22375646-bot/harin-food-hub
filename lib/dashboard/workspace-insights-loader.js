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
 const scope=await require('./active-ad-scope.js').loadActiveAdScope(db);
 const [marketing,workbench,searchTerms,converting]=await Promise.all([loadNaverMarketing({db,now:current,scope}).catch(()=>null),require('./keyword-workbench-loader.js').loadKeywordWorkbench(db,'KEYWORDS',scope),require('./keyword-workbench-loader.js').loadKeywordWorkbench(db,'SEARCH_TERMS',scope),require('./keyword-workbench-loader.js').loadKeywordWorkbench(db,'CONVERTED',scope)]);
 if(marketing){marketing.keywords={status:workbench.status,start:workbench.start,end:workbench.end,rows:workbench.rows.slice(0,40)};marketing.notes.unshift('현재 켜져 있고 운영 가능한 캠페인만 집계합니다. 중지된 캠페인의 과거 실적은 이 화면 합계에서 제외됩니다.');marketing.notes=marketing.notes.slice(0,8);marketing.converting=converting;marketing.workbench=workbench;marketing.searchTerms=searchTerms;const c=require('../operations-health/config.js').telegramConfig();marketing.telegram={configured:!!(c.token&&c.chatId),enabled:c.enabled===true,sendingEnabled:c.writesEnabled===true};}
 return {generatedAt:current.toISOString(),reports:result.data,marketing};
}
module.exports={loadWorkspaceInsights};
