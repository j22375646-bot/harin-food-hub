'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const config=require('../lib/operations-health/config.js');
const cloudWatch=require('../lib/operations-health/cloudwatch-client.js');
const vercel=require('../lib/operations-health/vercel-client.js');
const readiness=require('../lib/operations-health/readiness.js');
const routes=require('../lib/navigation/hub-routes.js');

const root=path.join(__dirname,'..');

test('phase 19-4 keeps worker, CloudWatch, and Vercel health isolated',()=>{
  const center=readiness.buildOperationsHealth({snapshots:[],heartbeats:[],env:{PUBLIC_APP_URL:'https://example.com'},now:new Date('2026-08-17T10:00:00Z')});
  assert.equal(center.phase,'19-4');
  assert.deepEqual(center.services.map(item=>item.key),['worker','cloudwatch','vercel']);
  assert.equal(center.services.find(item=>item.key==='cloudwatch').status,'SETUP_REQUIRED');
  assert.equal(center.services.find(item=>item.key==='vercel').status,'SETUP_REQUIRED');
  assert.equal(center.services.flatMap(item=>item.capabilities).every(item=>item.writeStatus==='NOT_APPLICABLE'),true);
});

test('CloudWatch and Vercel credentials never leak across providers',()=>{
  const env={AWS_CLOUDWATCH_ACCESS_KEY_ID:'aws-id',AWS_CLOUDWATCH_SECRET_ACCESS_KEY:'aws-secret',AWS_CLOUDWATCH_INSTANCE_ID:'i-123',VERCEL_HEALTH_TOKEN:'vercel-token',VERCEL_HEALTH_PROJECT_ID:'project',VERCEL_HEALTH_TEAM_ID:'team'};
  const aws=config.providerConfig('AWS_CLOUDWATCH',env);const release=config.providerConfig('VERCEL',env);
  assert.equal(aws.accessKeyId,'aws-id');assert.equal(Object.hasOwn(aws,'token'),false);
  assert.equal(release.token,'vercel-token');assert.equal(Object.hasOwn(release,'secretAccessKey'),false);
});

test('AWS query signing contains no secret and uses the monitoring service',()=>{
  const config={region:'ap-northeast-2',accessKeyId:'AKID',secretAccessKey:'TOPSECRET',sessionToken:'',instanceId:'i-123'};
  const body=cloudWatch.queryBody({Action:'DescribeAlarms',MaxRecords:100});
  const signed=cloudWatch.signedRequest({config,body,now:new Date('2026-08-17T10:00:00Z')});
  assert.match(body,/Action=DescribeAlarms/);assert.match(body,/Version=2010-08-01/);
  assert.match(signed.url,/monitoring\.ap-northeast-2\.amazonaws\.com/);assert.doesNotMatch(JSON.stringify(signed),/TOPSECRET/);
  assert.match(signed.headers.Authorization,/\/monitoring\/aws4_request/);
});

test('CloudWatch probe aggregates alarms and latest EC2 metrics only',async()=>{
  const responses={DescribeAlarms:'<DescribeAlarmsResponse><MetricAlarms><member><StateValue>OK</StateValue></member><member><StateValue>ALARM</StateValue></member></MetricAlarms></DescribeAlarmsResponse>',CPUUtilization:'<GetMetricStatisticsResponse><Datapoints><member><Timestamp>2026-08-17T09:55:00Z</Timestamp><Average>18.5</Average></member></Datapoints></GetMetricStatisticsResponse>',StatusCheckFailed:'<GetMetricStatisticsResponse><Datapoints><member><Timestamp>2026-08-17T09:55:00Z</Timestamp><Maximum>0</Maximum></member></Datapoints></GetMetricStatisticsResponse>'};
  const result=await cloudWatch.probe({config:{region:'ap-northeast-2',accessKeyId:'id',secretAccessKey:'secret',sessionToken:'',instanceId:'i-123'},now:new Date('2026-08-17T10:00:00Z'),fetchImpl:async(_url,options)=>{const body=new URLSearchParams(options.body);const key=body.get('Action')==='DescribeAlarms'?'DescribeAlarms':body.get('MetricName');return {ok:true,status:200,text:async()=>responses[key]};}});
  assert.equal(result.status,'PARTIAL');assert.equal(result.metricSummary.alarm_counts.alarm,1);assert.equal(result.metricSummary.cpu_average_percent,18.5);assert.equal(result.metricSummary.status_check_failed,0);
  assert.equal(Object.hasOwn(result.metricSummary,'raw_logs'),false);
});

test('Vercel can verify the public production URL while API credentials are deferred',async()=>{
  let calls=0;const result=await vercel.probe({config:{publicUrl:'https://harin-cafe24-sync.vercel.app'},missingFields:['Vercel 읽기 토큰'],fetchImpl:async()=>{calls+=1;return {ok:true,status:200};}});
  assert.equal(calls,1);assert.equal(result.status,'PARTIAL');assert.equal(result.metricSummary.public_ok,true);assert.equal(result.metricSummary.setup_required,true);
});

test('one provider failure preserves another provider success',()=>{
  const env={AWS_CLOUDWATCH_ACCESS_KEY_ID:'id',AWS_CLOUDWATCH_SECRET_ACCESS_KEY:'secret',AWS_CLOUDWATCH_INSTANCE_ID:'i-123',VERCEL_HEALTH_TOKEN:'token',VERCEL_HEALTH_PROJECT_ID:'project',VERCEL_HEALTH_TEAM_ID:'team',PUBLIC_APP_URL:'https://example.com'};
  const center=readiness.buildOperationsHealth({env,snapshots:[{provider:'AWS_CLOUDWATCH',status:'FAILED',fetched_at:'2026-08-17T09:01:00Z',error_message:'denied'},{provider:'VERCEL',status:'SUCCESS',fetched_at:'2026-08-17T09:00:00Z',metric_summary:{public_status:200,deployment_state:'READY'}}]});
  assert.equal(center.services.find(item=>item.key==='cloudwatch').status,'FAILED');assert.equal(center.services.find(item=>item.key==='vercel').status,'READY');
});

test('operations health workspace, protected probes, and service-role storage are real',()=>{
  assert.equal(routes.buildHubHref({view:'collection',workspace:'operations-health'}),'/data-collection/operations-health');
  assert.equal(fs.existsSync(path.join(root,'app/data-collection/operations-health/page.js')),true);
  const source=['cloudwatch','vercel'].map(name=>fs.readFileSync(path.join(root,`app/api/operations-health/${name}/probe/route.js`),'utf8')).join('\n')+fs.readFileSync(path.join(root,'lib/operations-health/route-handler.js'),'utf8');
  assert.match(source,/verifySession/);assert.doesNotMatch(source,/NEXT_PUBLIC_/);
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260817133642_add_operations_health_snapshots.sql'),'utf8');
  assert.match(migration,/enable row level security/i);assert.match(migration,/revoke all.*anon, authenticated/i);assert.match(migration,/grant select, insert, update, delete.*service_role/i);
  assert.doesNotMatch(migration,/customer_name|phone|address|raw_log|credential|access_key|secret/i);
});
