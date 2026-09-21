'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {blogAddress,draft,probe,registerBlogWorkspace}=require('../blog-workspace.cjs');
test('blog URL only permits canonical Naver homes',()=>{
 assert.equal(blogAddress('https://m.blog.naver.com/harin_food/').url,'https://blog.naver.com/harin_food');
 for(const x of ['https://evil.test/foo','https://blog.naver.com@evil.test/abc','https://blog.naver.com/abc/123','https://blog.naver.com/abc?redirect=x','http://blog.naver.com/abc','https://blog.naver.com:444/abc','https://blog.naver.com/../x','a'])assert.throws(()=>blogAddress(x));
});
test('draft sizes and shape constrained',()=>{assert.deepEqual(draft({title:'제목',body:'내용'}),{title:'제목',body:'내용'});for(const x of [{title:'',body:'a'},{title:'a',body:'a'.repeat(30001)},{title:'a',body:'b',token:'x'}])assert.throws(()=>draft(x));});
test('probe reports only public response and does not follow redirects',async()=>{
 let opts;const r=await probe('harin_food',async(url,o)=>{opts=o;assert.match(url,/blogId=harin_food$/);return new Response('<html>blogId 블로그</html>',{headers:{'content-type':'text/html'}});});assert.equal(r.ok,true);assert.match(r.message,/소유 계정/);assert.equal(opts.redirect,'manual');
 for(const response of [new Response('captcha',{headers:{'content-type':'text/html'}}),new Response('',{status:302,headers:{location:'http://127.0.0.1'}}),new Response('존재하지 않는 블로그',{headers:{'content-type':'text/html'}})])assert.equal((await probe('harin_food',async()=>response)).ok,false);
 assert.equal((await probe('harin_food',async()=>{throw Error('network');})).ok,false);
});
test('IPC denies untrusted requests and unknown actions',async()=>{
 let handler;registerBlogWorkspace({ipc:{handle:(name,fn)=>handler=fn},isTrusted:e=>e===true});
 await assert.rejects(()=>handler(false,{action:'probe',value:'harin_food'}));await assert.rejects(()=>handler(true,{action:'evil',value:''}));await assert.rejects(()=>handler(true,{action:'open',value:'https://evil.test/abc'}));
});
