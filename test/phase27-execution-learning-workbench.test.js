'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('27-7 실행 흐름은 확인된 자료만 건수로 표시하고 미수집은 확인 필요로 남긴다',()=>{
  const {buildExecutionDecisionLoop}=require('../lib/execution/decision-loop.js');
  const missing=buildExecutionDecisionLoop({});
  assert.deepEqual(missing.steps.map(item=>item.display),['확인 필요','확인 필요','확인 필요','확인 필요']);
  assert.equal(missing.has_missing_evidence,true);

  const ready=buildExecutionDecisionLoop({
    reportLearningHistory:{summary:{learned:3},items:[{id:'r1'}]},
    actions:[{status:'PLANNED'},{status:'EXECUTED'}],
    retentionValidation:{execution:{
      summary:{day7_ready:2,day14_ready:1},
      changes:[{status:'PREVIEWED'},{status:'VERIFIED'}]
    }},
    experiments:[{id:'e1'},{id:'e2'}]
  });
  assert.deepEqual(ready.steps.map(item=>item.value),[3,2,3,2]);
  assert.equal(ready.has_missing_evidence,false);
});

test('27-7 네 실행 페이지는 중복 이동막대 대신 하나의 학습 흐름을 공유한다',()=>{
  const workbench=read('app/_execution/harin-execution-workbench.js');
  const dashboard=read('app/dashboard-client.js');
  const visual=[read('app/_execution/execution-learning-loop.js'),read('lib/execution/decision-loop.js')].join('\n');

  assert.match(workbench,/ExecutionLearningLoop/);
  assert.match(workbench,/model=\{loopModel\}/);
  assert.match(visual,/data-core-visualization="execution-learning-loop"/);
  for(const label of ['진단 근거','변경 기록','7·14일 결과','다음 실험'])assert.match(visual,new RegExp(label));
  assert.doesNotMatch(dashboard,/function ExecutionWorkflowNav|const executionWorkflowSteps/);
});

test('27-7 실행 작업대는 평면 V8, 읽기 크기, 모바일과 동작 감소 규칙을 지킨다',()=>{
  const css=[
    read('app/_execution/execution-learning-loop.module.css'),
    read('app/_execution/harin-execution-v8.css')
  ].join('\n');
  const workbench=read('app/_execution/harin-execution-workbench.js');
  const dashboard=read('app/dashboard-client.js');

  assert.doesNotMatch(css,/(?:linear|radial)-gradient\(|backdrop-filter|filter:\s*blur/i);
  assert.match(css,/font-size:\s*14px/);
  assert.match(css,/min-height:\s*44px/);
  assert.match(css,/@media\s*\(max-width:\s*700px\)/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(workbench,/OWNER SAFETY PREVIEW|EXPERIMENT LEARNING|BEFORE → DAY/);
  assert.match(workbench,/id="page-ai-analysis"/);
  for(const page of ['reports','changes','validation','experiments'])assert.match(dashboard,new RegExp(`aiPagePanels\\?\\.${page}`));
});
