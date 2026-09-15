"""Only moa: callbacks for the two managed profiles. No Telegram polling."""
import asyncio,importlib.util,os,re
from pathlib import Path

def worker():
    home=Path(os.environ.get('HERMES_HOME','')).resolve()
    if home.name not in ('moaon-work','moaon-solo') or home.parent!=Path('/opt/data/profiles'):raise ValueError('PROFILE_SCOPE')
    path=home/'integrations/moaon/automation.py'
    spec=importlib.util.spec_from_file_location('moaon_action_worker',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    return m,'WORK' if home.name=='moaon-work' else 'SOLO'

def execute(payload):
    m,slot=worker();c=m.connector();key=m.secret(c)
    return m.command(c,key,{'action':'ACT_CLICK','slot':slot,**payload})

async def handle(adapter,update,context):
    query=update.callback_query
    match=re.fullmatch(r'moa:([DS]):([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})',query.data or '')
    msg=getattr(query,'message',None);user=getattr(query,'from_user',None)
    if not match or not msg or not user or getattr(user,'is_bot',False):
        await query.answer('사용할 수 없는 버튼입니다.',show_alert=True);return
    uid=str(user.id);chat=str(msg.chat_id);mid=str(msg.message_id)
    authorized=adapter._is_callback_user_authorized(uid,chat_id=msg.chat_id,chat_type=str(msg.chat.type),thread_id=str(msg.message_thread_id) if getattr(msg,'message_thread_id',None) else None,user_name=getattr(user,'first_name',None))
    if not authorized:
        await query.answer('이 봇을 사용할 권한이 없습니다.',show_alert=True);return
    await query.answer('모아온에서 확인하고 있어요.')
    try:
        result=await asyncio.to_thread(execute,{'id':match[2],'verb':'DRAFT' if match[1]=='D' else 'SNOOZE','userId':uid,'chatId':chat,'messageId':mid})
        if result['kind']=='DRAFT':text={'PENDING':'업무 등록안이 승인 대기 중입니다. 모아온 → 업무비서 → 업무 등록안에서 확인하세요.','APPROVED':'이 브리핑의 업무 등록안은 이미 승인되어 업무로 등록됐습니다.','REJECTED':'이 브리핑의 업무 등록안은 반려된 상태입니다. 중복 등록하지 않았어요.'}.get(result['status'],'모아온 업무 등록안에서 현재 상태를 확인하세요.')
        elif result['status']=='PENDING':text='1시간 뒤 다시 알림이 예약되어 있어요. 반복해서 눌러도 추가 예약되지 않습니다. 모아온에서 예약 시각 확인·취소가 가능합니다.'
        else:text='이 버튼의 다시 알림은 이미 처리되었거나 취소되었습니다. 중복 예약하지 않았어요.'
    except Exception:text='처리 결과를 확인하지 못했어요. 모아온의 업무 등록안·다시 알림 목록을 확인하세요. 오래된 버튼이나 변경된 수신처는 사용할 수 없습니다.'
    await msg.reply_text(text)
