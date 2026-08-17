'use strict';

function value(env,key){return String(env[key]||'').trim();}
function enabled(env,key){return value(env,key).toLowerCase()!=='false';}
function explicitlyEnabled(env,key){return value(env,key).toLowerCase()==='true';}

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

function githubReleaseConfig(env=process.env){
  return {
    provider:'GITHUB_RELEASES',enabled:enabled(env,'GITHUB_RELEASES_ENABLED'),
    owner:value(env,'GITHUB_RELEASE_OWNER')||'j22375646-bot',
    repo:value(env,'GITHUB_RELEASE_REPO')||'harin-food-hub',
    token:value(env,'GITHUB_RELEASE_TOKEN')
  };
}

function uptimeRobotConfig(env=process.env){
  return {
    provider:'UPTIMEROBOT',enabled:enabled(env,'UPTIMEROBOT_ENABLED'),
    apiKey:value(env,'UPTIMEROBOT_READ_ONLY_API_KEY'),
    publicUrl:value(env,'PUBLIC_APP_URL')||'https://harin-cafe24-sync.vercel.app'
  };
}

function telegramConfig(env=process.env){
  return {
    provider:'TELEGRAM_BOT',enabled:enabled(env,'TELEGRAM_ALERTS_ENABLED'),
    token:value(env,'TELEGRAM_BOT_TOKEN'),chatId:value(env,'TELEGRAM_ALERT_CHAT_ID'),
    writesEnabled:explicitlyEnabled(env,'TELEGRAM_ALERT_WRITES_ENABLED')
  };
}

function resendConfig(env=process.env){
  return {
    provider:'RESEND',enabled:enabled(env,'RESEND_HEALTH_ENABLED'),
    apiKey:value(env,'RESEND_API_KEY'),fromEmail:value(env,'REPORT_FROM_EMAIL'),
    writesEnabled:explicitlyEnabled(env,'RESEND_ALERT_WRITES_ENABLED')
  };
}

function providerConfig(provider,env=process.env){
  if(provider==='AWS_CLOUDWATCH')return cloudWatchConfig(env);
  if(provider==='VERCEL')return vercelConfig(env);
  if(provider==='GITHUB_RELEASES')return githubReleaseConfig(env);
  if(provider==='UPTIMEROBOT')return uptimeRobotConfig(env);
  if(provider==='TELEGRAM_BOT')return telegramConfig(env);
  if(provider==='RESEND')return resendConfig(env);
  throw new Error(`Unsupported operations health provider: ${provider}`);
}

function missingFields(provider,config){
  const fields={
    AWS_CLOUDWATCH:[['accessKeyId','CloudWatch 읽기 Access Key'],['secretAccessKey','CloudWatch 읽기 Secret Key'],['instanceId','EC2 인스턴스 ID']],
    VERCEL:[['token','Vercel 읽기 토큰'],['projectId','Vercel 프로젝트 ID'],['teamId','Vercel 팀 ID']],
    GITHUB_RELEASES:[['token','GitHub Contents 읽기 토큰']],
    UPTIMEROBOT:[['apiKey','UptimeRobot 읽기 전용 API 키']],
    TELEGRAM_BOT:[['token','Telegram Bot 토큰']],
    RESEND:[['apiKey','Resend API 키']]
  }[provider]||[];
  return fields.filter(([key])=>!config[key]).map(([,label])=>label);
}

function writeMissingFields(provider,config){
  const fields={
    TELEGRAM_BOT:[['chatId','Telegram 알림 채팅 ID']],
    RESEND:[['fromEmail','Resend 발신 이메일']]
  }[provider]||[];
  return fields.filter(([key])=>!config[key]).map(([,label])=>label);
}

module.exports={cloudWatchConfig,vercelConfig,githubReleaseConfig,uptimeRobotConfig,telegramConfig,resendConfig,providerConfig,missingFields,writeMissingFields};
