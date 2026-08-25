const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('26-8 official test runner ignores generated test files outside test/',()=>{
  let runHarinTests;
  try{
    ({runHarinTests}=require('../scripts/run-harin-tests.js'));
  }catch(error){
    assert.fail(`공식 테스트 범위를 고정하는 실행기가 없습니다: ${error.message}`);
  }

  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'harin-test-scope-'));
  try{
    fs.mkdirSync(path.join(fixture,'test'),{recursive:true});
    fs.mkdirSync(path.join(fixture,'generated'),{recursive:true});
    fs.writeFileSync(path.join(fixture,'test','inside.test.js'),"const test=require('node:test');test('inside',()=>{});\n");
    fs.writeFileSync(path.join(fixture,'generated','outside.test.js'),"const test=require('node:test');test('outside',()=>{throw new Error('generated file executed');});\n");

    const result=runHarinTests({cwd:fixture,stdio:'pipe'});
    const output=`${result.stdout||''}\n${result.stderr||''}`;
    assert.equal(result.status,0,output);
    assert.match(output,/tests 1\b/);
    assert.doesNotMatch(output,/generated file executed/);
  }finally{
    fs.rmSync(fixture,{recursive:true,force:true});
  }
});
