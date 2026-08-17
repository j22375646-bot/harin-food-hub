'use strict';

const crypto=require('node:crypto');

const SERVICE='monitoring';
const VERSION='2010-08-01';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const hmac=(key,value,encoding)=>crypto.createHmac('sha256',key).update(value).digest(encoding);
const compactDate=date=>date.toISOString().replace(/[:-]|\.\d{3}/g,'');
const xmlValue=(xml,tag)=>String(xml||'').match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim()||'';
const xmlMembers=(xml,parent)=>{
  const section=String(xml||'').match(new RegExp(`<${parent}>([\\s\\S]*?)</${parent}>`))?.[1]||'';
  return [...section.matchAll(/<member>([\s\S]*?)<\/member>/g)].map(match=>match[1]);
};
const numberOrNull=value=>value!==''&&Number.isFinite(Number(value))?Number(value):null;

function signingKey(secret,dateStamp,region){
  const date=hmac(`AWS4${secret}`,dateStamp);
  const regional=hmac(date,region);
  const service=hmac(regional,SERVICE);
  return hmac(service,'aws4_request');
}

function signedRequest({config,body,now=new Date()}){
  const host=`monitoring.${config.region}.amazonaws.com`;
  const amzDate=compactDate(now);const dateStamp=amzDate.slice(0,8);
  const headers={'content-type':'application/x-www-form-urlencoded; charset=utf-8',host,'x-amz-date':amzDate};
  if(config.sessionToken)headers['x-amz-security-token']=config.sessionToken;
  const signedHeaders=Object.keys(headers).sort().join(';');
  const canonicalHeaders=Object.keys(headers).sort().map(key=>`${key}:${headers[key]}\n`).join('');
  const canonicalRequest=['POST','/','',canonicalHeaders,signedHeaders,hash(body)].join('\n');
  const scope=`${dateStamp}/${config.region}/${SERVICE}/aws4_request`;
  const stringToSign=['AWS4-HMAC-SHA256',amzDate,scope,hash(canonicalRequest)].join('\n');
  const signature=hmac(signingKey(config.secretAccessKey,dateStamp,config.region),stringToSign,'hex');
  return {url:`https://${host}/`,headers:{...headers,Authorization:`AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`},body};
}

function queryBody(values){
  const params=new URLSearchParams();
  Object.entries({Version:VERSION,...values}).sort(([a],[b])=>a.localeCompare(b)).forEach(([key,value])=>params.set(key,String(value)));
  return params.toString();
}

function providerError(xml,status){
  const message=xmlValue(xml,'Message')||`CloudWatch 응답 오류 (${status})`;
  const error=new Error(message.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,180));
  error.code=xmlValue(xml,'Code')||'CLOUDWATCH_REQUEST_FAILED';error.status=status;return error;
}

async function request(values,{config,fetchImpl=fetch,now=new Date()}={}){
  const body=queryBody(values);const signed=signedRequest({config,body,now});
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetchImpl(signed.url,{method:'POST',headers:signed.headers,body:signed.body,signal:controller.signal,cache:'no-store'});
    const xml=await response.text();if(!response.ok)throw providerError(xml,response.status);return xml;
  }finally{clearTimeout(timeout);}
}

function metricRequest(metricName,statistic,config,now){
  const end=new Date(now);const start=new Date(end.getTime()-60*60*1000);
  return {Action:'GetMetricStatistics',Namespace:'AWS/EC2',MetricName:metricName,'Dimensions.member.1.Name':'InstanceId','Dimensions.member.1.Value':config.instanceId,StartTime:start.toISOString(),EndTime:end.toISOString(),Period:300,'Statistics.member.1':statistic};
}

function latestMetric(xml,statistic){
  return xmlMembers(xml,'Datapoints').map(item=>({timestamp:xmlValue(item,'Timestamp'),value:numberOrNull(xmlValue(item,statistic))})).filter(item=>item.timestamp&&item.value!==null).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp)))[0]||null;
}

function alarmSummary(xml){
  const states=xmlMembers(xml,'MetricAlarms').map(item=>xmlValue(item,'StateValue'));
  return {total:states.length,alarm:states.filter(value=>value==='ALARM').length,insufficient:states.filter(value=>value==='INSUFFICIENT_DATA').length,ok:states.filter(value=>value==='OK').length};
}

async function probe({config,fetchImpl=fetch,now=new Date()}={}){
  const [alarmsXml,cpuXml,statusXml]=await Promise.all([
    request({Action:'DescribeAlarms',MaxRecords:100},{config,fetchImpl,now}),
    request(metricRequest('CPUUtilization','Average',config,now),{config,fetchImpl,now}),
    request(metricRequest('StatusCheckFailed','Maximum',config,now),{config,fetchImpl,now})
  ]);
  const alarms=alarmSummary(alarmsXml);const cpu=latestMetric(cpuXml,'Average');const statusCheck=latestMetric(statusXml,'Maximum');
  return {status:alarms.alarm>0||Number(statusCheck?.value||0)>0?'PARTIAL':'SUCCESS',sourceTimestamp:[cpu?.timestamp,statusCheck?.timestamp].filter(Boolean).sort().at(-1)||null,metricSummary:{alarm_counts:alarms,cpu_average_percent:cpu?.value??null,status_check_failed:statusCheck?.value??null,instance_signal_at:statusCheck?.timestamp||cpu?.timestamp||null}};
}

module.exports={alarmSummary,latestMetric,probe,queryBody,signedRequest};
