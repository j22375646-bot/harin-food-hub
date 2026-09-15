#!/usr/bin/env python3
"""Manage only Moaon's two named Hermes profiles; never copy chat history."""
import json,os,subprocess,time,sys
from pathlib import Path

NAMES={'WORK':'moaon-work','SOLO':'moaon-solo'}
CLI='/opt/hermes/.venv/bin/hermes'

def cli(home,*args,required=True):
    env={**os.environ,'HERMES_HOME':str(home)}
    r=subprocess.run([CLI,*args],env=env,cwd=str(home),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=45)
    if required and r.returncode:raise ValueError('HERMES_PROFILE_CHECK_REQUIRED')
    return r.returncode==0

def process_running(p,proc_root=Path('/proc')):
    """Validate a profile's live process identity even when Hermes omits gateway.pid."""
    try:
        state=json.loads((p/'gateway_state.json').read_text())
        pid=state.get('pid')
        if not isinstance(pid,int) or pid<=1:return False
        proc=proc_root/str(pid)
        fields=(proc/'stat').read_text().rsplit(')',1)[1].split()
        platform=state.get('platforms',{}).get('telegram',{})
        if fields[0]=='Z' or int(fields[19])!=platform.get('writer_start_time') or platform.get('writer_pid')!=pid:return False
        argv=(proc/'cmdline').read_text().split('\0')
        scoped=any(argv[i] in ('-p','--profile') and argv[i+1]==p.name for i in range(len(argv)-1)) or '--profile='+p.name in argv
        return scoped and 'gateway' in argv
    except Exception:return False

def running(home,p):
    if process_running(p):return True
    try:
        if '/opt/hermes' not in sys.path:sys.path.insert(0,'/opt/hermes')
        from gateway.status import get_running_pid
        if get_running_pid(p/'gateway.pid'):return True
        state_path=home/'gateway_state.json'
        if state_path.exists() and get_running_pid(home/'gateway.pid'):
            state=json.loads(state_path.read_text())
            return p.name in state.get('served_profiles',[])
    except Exception:pass
    return False


def sync(c,key,command,home):
    import yaml
    rows=command(c,key,{'action':'BOT_CONFIG'})['bots']
    for row in rows:
        slot=row['slot'];name=NAMES[slot];p=home/'profiles'/name;marker=p/'.moaon-managed-profile';revision=p/'.moaon-revision'
        try:
            if p.is_symlink() or p.exists() and not marker.exists():raise ValueError('UNMANAGED_PROFILE')
            if not p.exists():
                if not row['settings']['enabled']:continue
                cli(home,'profile','create',name)
                c.save(marker,'1\n')
            s=row['settings'];old=revision.read_text().strip() if revision.exists() else ''
            if old!=str(row['revision']):
                # Stop this named profile before replacing its credentials, never the default gateway.
                cli(home,'-p',name,'gateway','stop',required=False)
                base=yaml.safe_load((home/'config.yaml').read_text()) or {}
                config={'model':base.get('model',{}),'terminal':{'cwd':str(p/'workspace')},'telegram':{'require_mention':True,'exclusive_bot_mentions':True,'allowed_chats':list(dict.fromkeys([s['chatId'],*s['allowedUsers']])),'observe_unmentioned_group_messages':False},'gateway':{'allow_all_users':False}}
                if slot=='SOLO':config['telegram']['allowed_chats']=[s['chatId']]
                c.save(p/'config.yaml',yaml.safe_dump(config,allow_unicode=True))
                env={'TELEGRAM_BOT_TOKEN':row.get('token') or '', 'TELEGRAM_ALLOWED_USERS':','.join(s['allowedUsers']),'TELEGRAM_ALLOWED_CHATS':','.join(config['telegram']['allowed_chats']),'TELEGRAM_REQUIRE_MENTION':'true','GATEWAY_ALLOW_ALL_USERS':'false'}
                c.save(p/'.env','\n'.join(k+'='+v for k,v in env.items())+'\n')
                prompt=('너는 모아온 업무비서다. 주문, 문의, 제품 지식과 업무 정리를 돕는다.' if slot=='WORK' else '너는 모아온 개인비서다. 본인의 질문과 아이디어, 개인 업무를 돕는다.')
                prompt+='\n한국어로 간결하게 답한다. 별표와 굵은 글씨를 남발하지 않는다. 다른 프로필의 대화나 기억을 읽지 않는다. 모아온 자료는 제공된 스킬로만 조회하고 기준 시각과 미확인 정보를 명시한다. 업무 등록안은 승인 전 실제 등록이라고 말하지 않는다.\n사용자 응답 선호:\n'+s['instructions']
                c.save(p/'SOUL.md',prompt)
                for skill in ['moaon-read','moaon-operations']:
                    source=home/'skills'/skill/'SKILL.md'
                    if source.exists():
                        target=p/'skills'/skill;target.mkdir(parents=True,exist_ok=True);c.save(target/'SKILL.md',source.read_text())
                c.save(revision,str(row['revision']))
            target=p/'integrations'/'moaon';target.mkdir(parents=True,exist_ok=True);target.chmod(0o700)
            for file in ['read.py','automation.py','read.key']:
                value=(home/'integrations'/'moaon'/file).read_text()
                if not (target/file).exists() or (target/file).read_text()!=value:c.save(target/file,value)
            if s['enabled']:
                if not running(home,p):
                    cli(home,'-p',name,'gateway','start',required=False)
                    for _ in range(5):
                        if running(home,p):break
                        time.sleep(1)
                status='RUNNING' if running(home,p) else 'CHECK_REQUIRED'
            else:
                cli(home,'-p',name,'gateway','stop',required=False)
                status='CHECK_REQUIRED' if running(home,p) else 'STOPPED'
            command(c,key,{'action':'BOT_REPORT','slot':slot,'revision':row['revision'],'status':status})
        except Exception:
            command(c,key,{'action':'BOT_REPORT','slot':slot,'revision':row['revision'],'status':'CHECK_REQUIRED'})
    return rows
