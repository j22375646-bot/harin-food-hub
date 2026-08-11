import authModule from '../../../../lib/dashboard-auth.js';
import reportModule from '../../../../lib/reports/weekly.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}
function safeDate(value){return /^20\d{2}-\d{2}-\d{2}$/.test(String(value||''))?String(value):null;}

export async function POST(request){if(!authModule.verifySession(cookieValue(request)))return Response.json({ok:false,error:'Unauthorized'},{status:401});try{const body=await request.json();const start=safeDate(body.period_start),end=safeDate(body.period_end);if(!start||!end||start>end)return Response.json({ok:false,error:'분석 기간을 확인해주세요.'},{status:400});const result=await reportModule.generateReport({period:{start,end},platform:body.platform,reportType:body.report_type,mode:'MANUAL',deduplicate:false});return Response.json({ok:true,...result});}catch(error){console.error('[report generate]',error);return Response.json({ok:false,error:error.message||'보고서 생성 실패'},{status:500});}}
