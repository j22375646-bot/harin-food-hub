import weeklyModule from '../../../../lib/reports/weekly.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;

export async function GET(request){
  const secret=String(process.env.CRON_SECRET||'').trim();
  if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({ok:false,error:'Unauthorized'},{status:401});
  try{return Response.json({ok:true,...await weeklyModule.generateWeekly()});}
  catch(error){console.error('[weekly report]',error);return Response.json({ok:false,error:error.message||'주간보고서 생성 실패'},{status:500});}
}
