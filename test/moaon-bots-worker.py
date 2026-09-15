import importlib.util,tempfile,json
from pathlib import Path
from unittest.mock import patch
s=importlib.util.spec_from_file_location('bots','public/integrations/moaon-bots.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory(dir='D:/GPT/tmp') as temp:
 home=Path(temp);(home/'config.yaml').write_text('model:\n  default: example\n',encoding='utf-8');source=home/'integrations'/'moaon';source.mkdir(parents=True)
 for f in ['read.py','automation.py','read.key']:(source/f).write_text('test only',encoding='utf-8')
 rows=[dict(slot=x,revision=1,token='fake-'+x,settings=dict(enabled=True,chatId='123',allowedUsers=['123'],instructions='간결하게')) for x in ['WORK','SOLO']];reports=[]
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
  assert len(reports)==2 and all(x['status']=='RUNNING' for x in reports)
  assert 'fake-WORK' in (home/'profiles/moaon-work/.env').read_text()
  assert 'fake-SOLO' in (home/'profiles/moaon-solo/.env').read_text()
  assert not (home/'profiles/moaon-solo/memories').exists()
  assert not (home/'.env').exists()
  assert (home/'profiles/moaon-solo/integrations/moaon/read.key').exists()
 print('PASS: separate owned profiles, preserved default, connector files, status reporting')
