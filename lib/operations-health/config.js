'use strict';

function value(env,key){return String(env[key]||'').trim();}
function enabled(env,key){return value(env,key).toLowerCase()!=='false';}

function cloudWatchConfig(env=process.env){
  return {
    provider:'AWS_CLOUDWATCH',enabled:enabled(env,'AWS_CLOUDWATCH_ENABLED'),
    region:value(env,'AWS_CLOUDWATCH_REGION')||'ap-northeast-2',
    accessKeyId:value(env,'AWS_CLOUDWATCH_ACCESS_KEY_ID'),
    secretAccessKey:value(env,'AWS_CLOUDWATCH_SECRET_ACCESS_KEY'),
    sessionToken:value(env,'AWS_CLOUDWATCH_SESSION_TOKEN'),
    instanceId:value(env,'AWS_CLOUDWATCH_INSTANCE_ID')
  };
}

function vercelConfig(env=process.env){
  return {
    provider:'VERCEL',enabled:enabled(env,'VERCEL_HEALTH_ENABLED'),
    token:value(env,'VERCEL_HEALTH_TOKEN'),
    projectId:value(env,'VERCEL_HEALTH_PROJECT_ID'),
    teamId:value(env,'VERCEL_HEALTH_TEAM_ID'),
    publicUrl:value(env,'PUBLIC_APP_URL')||'https://harin-cafe24-sync.vercel.app'
  };
}

function providerConfig(provider,env=process.env){
  if(provider==='AWS_CLOUDWATCH')return cloudWatchConfig(env);
  if(provider==='VERCEL')return vercelConfig(env);
  throw new Error(`Unsupported operations health provider: ${provider}`);
}

function missingFields(provider,config){
  const fields=provider==='AWS_CLOUDWATCH'
    ? [['accessKeyId','CloudWatch 읽기 Access Key'],['secretAccessKey','CloudWatch 읽기 Secret Key'],['instanceId','EC2 인스턴스 ID']]
    : [['token','Vercel 읽기 토큰'],['projectId','Vercel 프로젝트 ID'],['teamId','Vercel 팀 ID']];
  return fields.filter(([key])=>!config[key]).map(([,label])=>label);
}

module.exports={cloudWatchConfig,vercelConfig,providerConfig,missingFields};
