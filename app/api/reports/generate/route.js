import authModule from '../../../../lib/dashboard-auth.js';
import reportModule from '../../../../lib/reports/weekly.js';
import apiSafety from '../../../../lib/api/safety.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}
const safeDate=apiSafety.isoDate;

export async function POST(request){if(!authModule.verifySession(cookieValue(request)))return apiSafety.unauthorized();try{const body=await apiSafety.readJson(request);const start=safeDate(body.period_start),end=safeDate(body.period_end);if(!start||!end||start>end)return apiSafety.json({ok:false,error:'분석 기간을 확인해주세요.'},{status:400});const result=await reportModule.generateReport({period:{start,end},platform:body.platform,reportType:body.report_type,mode:'MANUAL',deduplicate:false});return apiSafety.json({ok:true,...result});}catch(error){console.error('[report generate]',error);return apiSafety.inputErrorResponse(error)||apiSafety.json({ok:false,error:error.message||'보고서 생성 실패'},{status:500});}}
