import importlib.util,tempfile,json
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('bots','public/integrations/moaon-bots.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory(dir='D:/GPT/tmp') as temp:
 home=Path(temp);(home/'config.yaml').write_text('model:\n  default: example\n',encoding='utf-8');source=home/'integrations'/'moaon';source.mkdir(parents=True)
 for f in ['read.py','automation.py','read.key']:(source/f).write_text('test only',encoding='utf-8')
 (source/'learning.py').write_text('learning helper test only',encoding='utf-8')
 (home/'skills/moaon-learning').mkdir(parents=True)
 (home/'skills/moaon-learning/SKILL.md').write_text('knowledge test only',encoding='utf-8')
 rows=[dict(slot=x,revision=1,token='fake-'+x,settings=dict(enabled=True,chatId='123',allowedUsers=['123'],instructions='간결하게')) for x in ['WORK','SOLO','STUDY']];reports=[]
 def command(c,key,p):
  if p['action']=='BOT_CONFIG':return {'bots':rows}
  reports.append(p);return {'saved':True}
 def cli(h,*a,**kw):
  if a[0]=='profile':(h/'profiles'/a[2]).mkdir(parents=True)
  return True
 class C:
  @staticmethod
  def save(p,t):p.write_text(t,encoding='utf-8')
 with patch.object(m,'cli',cli),patch.object(m,'running',lambda *a:True),patch.dict(m.os.environ,{},clear=False):
  m.sync(C,'not-a-real-key',command,home)
  assert len(reports)==3 and all(x['status']=='RUNNING' for x in reports)
  assert 'fake-WORK' in (home/'profiles/moaon-work/.env').read_text()
  assert 'fake-SOLO' in (home/'profiles/moaon-solo/.env').read_text()
  assert not (home/'profiles/moaon-solo/memories').exists()
  assert not (home/'.env').exists()
  assert (home/'profiles/moaon-solo/integrations/moaon/read.key').exists()
  assert 'fake-STUDY' in (home/'profiles/moaon-study/.env').read_text()
  assert (home/'profiles/moaon-study/integrations/moaon/learning.py').exists()
  assert (home/'profiles/moaon-study/skills/moaon-learning/SKILL.md').exists()
  assert not (home/'profiles/moaon-study/skills/moaon-operations').exists()
  assert not (home/'profiles/moaon-study/auth.json').exists()
  assert not (home/'profiles/moaon-study/memories').exists()
 print('PASS: separate owned profiles, preserved default, connector files, status reporting')

with tempfile.TemporaryDirectory(dir='D:/GPT/tmp') as temp:
 root=Path(temp);profile=root/'moaon-work';profile.mkdir();proc=root/'proc'/'123';proc.mkdir(parents=True)
 state={'pid':123,'platforms':{'telegram':{'writer_pid':123,'writer_start_time':777}}}
 (profile/'gateway_state.json').write_text(json.dumps(state))
 fields=['S']+['0']*18+['777'];(proc/'stat').write_text('123 (hermes gateway) '+' '.join(fields))
 (proc/'cmdline').write_text('python\0hermes\0-p\0moaon-work\0gateway\0run\0')
 assert m.process_running(profile,root/'proc')
 (proc/'cmdline').write_text('python\0hermes\0-p\0moaon-solo\0gateway\0run\0')
 assert not m.process_running(profile,root/'proc')
 (proc/'cmdline').write_text('python\0hermes\0-p\0moaon-work\0gateway\0run\0')
 fields[-1]='888';(proc/'stat').write_text('123 (hermes gateway) '+' '.join(fields))
 assert not m.process_running(profile,root/'proc')
 print('PASS: missing pid file supported; wrong profile and reused PID rejected')
