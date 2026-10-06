'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {prompt,parse,tones}=require('../ui/blog-ai-contract.js');const {validCommand}=require('../general-chat-contract.cjs');
test('blog prompt fits Gemini contract with isolated conversation and no reports',()=>{
 const question=prompt({facts:'가'.repeat(2000),purpose:'나'.repeat(250),tone:tones[0]});assert.ok(question.length<=4000);
 assert.equal(validCommand({operation:'GENERATE',input:{requestId:crypto.randomUUID(),conversationId:crypto.randomUUID(),question,reportIds:[],files:[],model:'gemini-3.5-flash-lite'}}),true);
 assert.match(question,/지어내지/);assert.match(question,/참고 데이터/);assert.throws(()=>prompt({facts:'',purpose:'',tone:tones[0]}));
});
test('Gemini output must have valid title/body/checks, never HTML parsing',()=>{
 assert.deepEqual(parse('```json\n{"title":"제목","body":"본문","checks":["가격 확인"]}\n```'),{title:'제목',body:'본문',checks:['가격 확인']});
 for(const s of ['설명만 있음','{"title":"a","body":"b"}','{"title":"","body":"b","checks":[]}',JSON.stringify({title:'a',body:'b',checks:[{}]}),JSON.stringify({title:'a'.repeat(151),body:'b',checks:[]})])assert.throws(()=>parse(s));
 assert.equal(parse('{"title":"<script>x</script>","body":"내용","checks":[]}').title,'<script>x</script>');
});
