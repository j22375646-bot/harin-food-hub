'use strict';

const crypto=require('node:crypto');
const ExcelJS=require('exceljs');
const {getSupabase}=require('../cafe24/supabase.js');

const BATCH_SIZE=400;
const MAX_ROWS=60000;
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const number=value=>{if(typeof value==='number')return Number.isFinite(value)?value:0;const raw=String(value??'').trim();if(!raw)return 0;const negative=raw.startsWith('-')||(/^\(.*\)$/.test(raw));const parsed=Number(raw.replace(/[^0-9.]/g,''))||0;return negative?-parsed:parsed;};
const text=value=>value==null||value===''?null:String(value).trim();
const percent=value=>number(value);
function isoDate(value){
  const raw=String(value??'').trim();
  const compact=raw.match(/^(20\d{2})(\d{2})(\d{2})$/);
  if(compact)return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const match=raw.match(/(20\d{2})[^0-9]+(\d{1,2})[^0-9]+(\d{1,2})/);
  if(!match)return null;
  return `${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`;
}
const clean=value=>value?.result??value?.text??value;
function rowValues(row){return row.values.slice(1).map(clean);}
function rawObject(headers,row){return Object.fromEntries(headers.map((header,index)=>[header,row[index]??null]));}

async function workbookRows(buffer){
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer));
  const sheet=workbook.worksheets[0];
  const rows=[];
  sheet.eachRow({includeEmpty:false},row=>rows.push(rowValues(row)));
  if(rows.length-1>MAX_ROWS)throw new Error(`한 파일은 최대 ${MAX_ROWS.toLocaleString()}행까지 업로드할 수 있습니다.`);
  return {sheet:sheet.name,headers:rows[0].map(value=>String(value??'').trim()),rows:rows.slice(1)};
}

function detect(headers){
  if(headers.includes('총 전환매출액(14일)')&&headers.includes('키워드'))return 'AD_KEYWORD';
  if(headers.includes('청구금액(+부가가치세)')&&headers.includes('배송유형'))return 'AD_SETTLEMENT';
  throw new Error('쿠팡 광고 키워드 또는 일별 광고비 정산 파일이 아닙니다.');
}

function mapKeyword(headers,row){
  const date=isoDate(row[0]);
  const campaignId=text(row[4]);
  if(!date||!campaignId)return null;
  const advertisedOptionId=text(row[8]);
  const convertedOptionId=text(row[10]);
  const keyword=text(row[12])||'-';
  const sourceHash=hash([date,campaignId,advertisedOptionId,convertedOptionId,text(row[11]),keyword].join('|'));
  return {
    date,billing_method:text(row[1]),sales_method:text(row[2]),ad_type:text(row[3]),campaign_id:campaignId,campaign_name:text(row[5]),ad_group:text(row[6]),advertised_product_name:text(row[7]),advertised_option_id:advertisedOptionId,converted_product_name:text(row[9]),converted_option_id:convertedOptionId,placement:text(row[11]),keyword,
    impressions:number(row[13]),clicks:number(row[14]),ad_spend:number(row[15]),ctr:percent(row[16]),orders_1d:number(row[17]),direct_orders_1d:number(row[18]),indirect_orders_1d:number(row[19]),units_1d:number(row[20]),direct_units_1d:number(row[21]),indirect_units_1d:number(row[22]),revenue_1d:number(row[23]),direct_revenue_1d:number(row[24]),indirect_revenue_1d:number(row[25]),orders_14d:number(row[26]),direct_orders_14d:number(row[27]),indirect_orders_14d:number(row[28]),units_14d:number(row[29]),direct_units_14d:number(row[30]),indirect_units_14d:number(row[31]),revenue_14d:number(row[32]),direct_revenue_14d:number(row[33]),indirect_revenue_14d:number(row[34]),roas_1d:percent(row[35]),direct_roas_1d:percent(row[36]),indirect_roas_1d:percent(row[37]),roas_14d:percent(row[38]),direct_roas_14d:percent(row[39]),indirect_roas_14d:percent(row[40]),campaign_start_date:isoDate(row[41]),campaign_end_date:isoDate(row[42]),source_hash:sourceHash,raw_data:rawObject(headers,row),updated_at:new Date().toISOString()
  };
}

function mapSettlement(headers,rows){
  const mapped=[];let currentDate=null;
  for(const row of rows){
    if(String(row[0]??'').trim()==='전체')continue;
    const rowDate=isoDate(row[0]);
    if(rowDate)currentDate=rowDate;
    if(!currentDate)continue;
    const delivery=text(row[1]);
    const campaignId=text(row[7]);
    const rowType=delivery?'DELIVERY_SUMMARY':campaignId?'CAMPAIGN':null;
    if(!rowType)continue;
    const deliveryType=delivery||'ALL';
    const sourceHash=hash([currentDate,rowType,deliveryType,campaignId||'',text(row[8])||''].join('|'));
    mapped.push({date:currentDate,row_type:rowType,delivery_type:deliveryType,vat_type:text(row[2]),creator_id:text(row[3]),manager_type:text(row[4]),ad_type:text(row[5]),ad_goal:text(row[6]),campaign_id:campaignId,campaign_name:text(row[8]),chargeable_amount_type:text(row[9]),budget_type:text(row[10]),ad_budget:number(row[11]),spent_amount:number(row[12]),adjusted_amount:number(row[13]),spent_after_adjustment:number(row[14]),excess_spent_amount:number(row[15]),chargeable_ad_spend:number(row[16]),vat:number(row[17]),billed_amount:number(row[18]),source_hash:sourceHash,raw_data:rawObject(headers,row),updated_at:new Date().toISOString()});
  }
  return mapped;
}

async function upsert(db,table,rows){
  const unique=[...new Map(rows.map(row=>[row.source_hash,row])).values()];
  for(let index=0;index<unique.length;index+=BATCH_SIZE){const result=await db.from(table).upsert(unique.slice(index,index+BATCH_SIZE),{onConflict:'source_hash'});if(result.error)throw result.error;}
  return unique.length;
}

async function importAdFile({buffer,fileName}){
  const db=getSupabase();
  const parsed=await workbookRows(buffer);const type=detect(parsed.headers);
  const started=await db.from('sync_logs').insert({platform:'COUPANG',job_type:type,status:'RUNNING',metadata:{file_name:fileName,sheet:parsed.sheet,input_rows:parsed.rows.length}}).select('id').single();
  if(started.error)throw started.error;
  try{
    const rows=type==='AD_KEYWORD'?parsed.rows.map(row=>mapKeyword(parsed.headers,row)).filter(Boolean):mapSettlement(parsed.headers,parsed.rows);
    const table=type==='AD_KEYWORD'?'coupang_ad_keyword_daily':'coupang_ad_settlement_daily';
    const stored=await upsert(db,table,rows);const dates=rows.map(row=>row.date).sort();
    const summary={file_name:fileName,type,input_rows:parsed.rows.length,stored_rows:stored,invalid_rows:parsed.rows.length-rows.length,period_start:dates[0]||null,period_end:dates.at(-1)||null};
    await db.from('raw_api_responses').insert({platform:'COUPANG',endpoint:`FILE_IMPORT:${type}`,http_status:200,period_start:summary.period_start,period_end:summary.period_end,response_json:{...summary,file_hash:hash(buffer)}});
    await db.from('sync_logs').update({status:'SUCCESS',finished_at:new Date().toISOString(),rows_received:stored,metadata:{counts:{[type==='AD_KEYWORD'?'adKeywords':'adSettlements']:stored},...summary}}).eq('id',started.data.id);
    return summary;
  }catch(error){await db.from('sync_logs').update({status:'FAILED',finished_at:new Date().toISOString(),error_message:error.message}).eq('id',started.data.id);throw error;}
}

module.exports={importAdFile,detect,mapKeyword,mapSettlement,isoDate};
