const {spawnSync}=require('node:child_process');

function runHarinTests({cwd=process.cwd(),stdio='inherit'}={}){
  const env={...process.env};
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath,['--test','test/**/*.test.js'],{
    cwd,
    stdio,
    encoding:stdio==='pipe'?'utf8':undefined,
    env
  });
}

if(require.main===module){
  const result=runHarinTests();
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
}

module.exports={runHarinTests};
