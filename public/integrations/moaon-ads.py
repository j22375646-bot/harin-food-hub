"""Advertising-only helper for the managed private advertising profile."""
import os,sys,json,importlib.util,datetime as dt
from pathlib import Path
def main():
 home=Path(os.environ.get('HERMES_HOME','')).resolve()
 if home!=Path('/opt/data/profiles/moaon-ad') or not (home/'.moaon-managed-profile').is_file():raise ValueError('PROFILE_SCOPE')
 spec=importlib.util.spec_from_file_location('automation',home/'integrations/moaon/automation.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 c=m.connector();key=m.secret(c)
 env=dict(line.split('=',1) for line in (home/'.env').read_text().splitlines() if '=' in line);uid=env.get('TELEGRAM_ALLOWED_USERS','')
 if not uid.isdigit():raise ValueError('PRIVATE_ACCOUNT_REQUIRED')
 payload={'action':'ADS_READ','userId':uid,'chatId':uid}
 if len(sys.argv)==3 and sys.argv[1]=='--request' and sys.argv[2] in ('yesterday','seven','week'):
  today=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date();end=today-dt.timedelta(days=1);start=end if sys.argv[2]=='yesterday' else end-dt.timedelta(days=6)
  if sys.argv[2]=='week':end=today-dt.timedelta(days=today.weekday()+1);start=end-dt.timedelta(days=6)
  payload.update(action='ADS_REQUEST',start=str(start),end=str(end),fresh=True)
 elif sys.argv[1:]!=['--list']:raise ValueError('ARGUMENTS')
 value=m.command(c,key,payload);value['jobs']=value.get('jobs',[])[:5];print(json.dumps(value,ensure_ascii=False))
if __name__=='__main__':
 try:main()
 except Exception:print(json.dumps({'ok':False,'code':'ADS_CHECK_REQUIRED'}));sys.exit(1)
