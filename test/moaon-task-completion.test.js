'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('task completion atomically checks all children across write paths; reopening preserves progress',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table public.moaon_tasks(id int primary key,status text,checklist jsonb,revision int default 1,updated_at timestamptz default now(),completed_at timestamptz,completed_by text,deleted_at timestamptz);
   insert into public.moaon_tasks(id,status,checklist,completed_at,completed_by) values
   (1,'DONE','[{"text":"a","done":false},{"text":"b","done":true},{"text":"c","done":false}]','2026-09-16T01:00:00Z','original'),
   (2,'OPEN','[{"text":"one","done":true},{"text":"two","done":false}]',null,null),
   (3,'DONE','[]','2026-09-16T01:00:00Z','original');`);
  await db.exec(fs.readFileSync('supabase/migrations/20260916173000_moaon_task_complete_checklist.sql','utf8'));
  const read=async id=>(await db.query('select * from public.moaon_tasks where id=$1',[id])).rows[0];
  let t=await read(1);assert.deepEqual(t.checklist,[{text:'a',done:true},{text:'b',done:true},{text:'c',done:true}]);assert.equal(t.revision,2);assert.equal(t.completed_by,'original');assert.equal(new Date(t.completed_at).toISOString(),'2026-09-16T01:00:00.000Z');assert.equal((await read(3)).revision,1);
  assert.equal((await read(2)).checklist[1].done,false);
  await db.exec("update public.moaon_tasks set status='DONE',revision=revision+1 where id=2");assert.ok((await read(2)).checklist.every(x=>x.done));
  await db.exec("update public.moaon_tasks set status='OPEN' where id=2");assert.ok((await read(2)).checklist.every(x=>x.done));
  await db.exec(`update public.moaon_tasks set checklist=jsonb_set(checklist,'{0,done}','false') where id=2`);assert.equal((await read(2)).checklist[0].done,false);assert.equal((await read(2)).checklist[1].done,true);
  await db.exec(`begin;update public.moaon_tasks set status='DONE' where id=2;rollback;`);assert.equal((await read(2)).status,'OPEN');assert.equal((await read(2)).checklist[0].done,false);
  await db.exec(`insert into public.moaon_tasks(id,status,checklist) values(4,'DONE','[{"text":"bot","done":false}]')`);assert.equal((await read(4)).checklist[0].done,true);
  assert.equal((await db.query("select has_function_privilege('anon','public.moaon_task_complete_checklist()','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
