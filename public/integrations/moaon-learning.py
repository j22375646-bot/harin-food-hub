#!/usr/bin/env python3
"""Submit a review proposal from the isolated study profile. Never publish."""
import importlib.util,json,os,sys,uuid
from pathlib import Path

def submit(value,command):
    if not isinstance(value,dict) or set(value)!={'id','title','body','source','targetId','baseRevision'}:raise ValueError('INVALID')
    if value['id'] is None:value['id']=str(uuid.uuid4())
    return command({'action':'LEARN_SUBMIT',**value})

def main():
    try:
        home=Path(os.environ.get('HERMES_HOME','')).resolve()
        if home.parent!=Path('/opt/data/profiles') or home.name not in ('moaon-study','moaon-work','moaon-solo'):raise ValueError('PROFILE_SCOPE')
        base=home/'integrations/moaon'
        spec=importlib.util.spec_from_file_location('moaon_learning_worker',base/'automation.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
        c=m.connector();key=m.secret(c)
        if sys.argv[1:]==['--catalog']:
            print(json.dumps(m.command(c,key,{'action':'CATALOG'}),ensure_ascii=False));return
        if len(sys.argv)==3 and sys.argv[1]=='--article':
            print(json.dumps(m.command(c,key,{'action':'ARTICLE','id':str(uuid.UUID(sys.argv[2]))}),ensure_ascii=False));return
        if home.name!='moaon-study' or sys.argv[1:]!=['--submit']:raise ValueError('PROFILE_SCOPE')
        raw=sys.stdin.read(40001)
        if len(raw)>40000:raise ValueError('TOO_LARGE')
        value=json.loads(raw)
        if value.get('id') is None:value['id']=str(uuid.uuid4())
        # Durable local request before HTTP; retry this exact request after uncertainty.
        uid=str(uuid.UUID(value['id']))
        if uid!=value['id']:raise ValueError('INVALID_ID')
        out=base/'learning-outbox';out.mkdir(mode=0o700,exist_ok=True)
        path=out/(uid+'.json')
        if path.exists():
            if json.loads(path.read_text())!=value:raise ValueError('CONFLICT')
        else:
            fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'w') as f:json.dump(value,f,ensure_ascii=False)
        result=submit(value,lambda p:m.command(c,key,p))
        print(json.dumps(result,ensure_ascii=False))
    except Exception:
        print(json.dumps({'ok':False,'code':'LEARNING_CHECK_REQUIRED','requestId':locals().get('uid')}));sys.exit(1)
if __name__=='__main__':main()
