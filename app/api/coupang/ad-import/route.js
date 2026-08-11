import authModule from '../../../../lib/dashboard-auth.js';
import adImportModule from '../../../../lib/coupang/ad-file-import.js';
import reportModule from '../../../../lib/reports/weekly.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const MAX_BYTES=30*1024*1024;
function cookieValue(request){return request.headers.get('cookie')?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${authModule.COOKIE_NAME}=`))?.split('=').slice(1).join('=');}

export async function POST(request){
  if(!authModule.verifySession(cookieValue(request)))return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{
    const form=await request.formData();const files=form.getAll('files').filter(file=>file&&typeof file.arrayBuffer==='function');
    if(!files.length)return Response.json({ok:false,error:'쿠팡 광고 XLSX 파일을 선택해주세요.'},{status:400});
    const results=[];
    for(const file of files){if(file.size>MAX_BYTES)throw new Error(`${file.name}: 30MB를 초과합니다.`);if(!file.name.toLowerCase().endsWith('.xlsx'))throw new Error(`${file.name}: XLSX 파일만 지원합니다.`);results.push(await adImportModule.importAdFile({buffer:Buffer.from(await file.arrayBuffer()),fileName:file.name}));}
    const periods=results.flatMap(item=>[item.period_start,item.period_end]).filter(Boolean).sort();let reports=[];
    if(periods.length){for(const platform of ['COUPANG','ALL']){try{reports.push(await reportModule.generateReport({period:{start:periods[0],end:periods.at(-1)},platform,reportType:'ADHOC',mode:'COUPANG_AD_FILE_IMPORT',deduplicate:false}));}catch(error){reports.push({created:false,platform,error:error.message});}}}
    return Response.json({ok:true,results,reports});
  }catch(error){console.error('[coupang ad import]',error);return Response.json({ok:false,error:error.message||'쿠팡 광고파일 처리 실패'},{status:500});}
}
