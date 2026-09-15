"""Managed Telegram menus. Uses Hermes' existing gateway, never a second poller."""
import asyncio,importlib.util,json,os,re,datetime as dt
from pathlib import Path

ROOT=Path('/opt/data/integrations/moaon')
CATALOG={
 'WORK':[('briefing','📊 업무 브리핑'),('orders','📦 주문·배송'),('cs','💬 고객 문의'),('tasks','✅ 업무 관리'),('knowledge','📚 제품·운영 지식'),('settings','⚙️ 알림 설정')],
 'SOLO':[('tasks','☀️ 오늘 내 업무'),('memo','📝 빠른 메모'),('reminders','⏰ 내 알림'),('focus','🎯 오늘 집중할 일'),('review','🌙 하루 정리'),('settings','⚙️ 내 설정')],
 'STUDY':[('register','📥 자료 등록'),('knowledge','🔎 지식 찾기'),('pending','🕓 검토 대기'),('correct','✏️ 지식 수정'),('quiz','🧪 기억 테스트'),('settings','⚙️ 학습 현황')]}
NAMES={'moaon-work':'WORK','moaon-solo':'SOLO','moaon-study':'STUDY'}
UUID=r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
APP='https://harin-cafe24-sync.vercel.app'

def scope():
 home=Path(os.environ.get('HERMES_HOME','')).resolve()
 if home.parent!=Path('/opt/data/profiles') or home.name not in NAMES or not (home/'.moaon-managed-profile').is_file():raise ValueError('PROFILE_SCOPE')
 return home,NAMES[home.name]

def api(payload):
 home,_=scope();spec=importlib.util.spec_from_file_location('moaon_menu_worker',home/'integrations/moaon/automation.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 c=m.connector();key=m.secret(c)
 return m.command(c,key,payload)

def snapshot():
 home,_=scope();spec=importlib.util.spec_from_file_location('moaon_menu_read',home/'integrations/moaon/read.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 if m.KEY.is_symlink() or m.KEY.stat().st_mode & 0o077:raise ValueError('KEY_PERMISSIONS')
 return m.read(m.KEY.read_text().strip())

def keyboard(slot,items):
 labels=dict(CATALOG[slot]);values=[labels[x] for x in items if x in labels]
 return {'keyboard':[values[i:i+2] for i in range(0,len(values),2)],'resize_keyboard':True,'is_persistent':True,'input_field_placeholder':'메뉴를 고르거나 편하게 질문하세요'}

def inline(rows):
 from telegram import InlineKeyboardMarkup,InlineKeyboardButton
 return InlineKeyboardMarkup([[InlineKeyboardButton(label,**({'url':value} if value.startswith('https://') else {'callback_data':'moa:m:'+value})) for label,value in row] for row in rows])

def nav():return [[('처음으로','home'),('모아온 웹 허브 ↗',APP)]]
def count(v):return str(v)+'건' if isinstance(v,int) and not isinstance(v,bool) else '확인 필요'
def label(v):return {'NAVER':'네이버','CAFE24':'카페24','COUPANG':'쿠팡'}.get(v,str(v))

def focus_file(uid):
 if not re.fullmatch(r'[1-9][0-9]{0,18}',uid):raise ValueError('IDENTITY')
 home,_=scope();folder=home/'integrations/moaon/focus';folder.mkdir(mode=0o700,exist_ok=True)
 if folder.is_symlink():raise ValueError('PATH')
 p=folder/(uid+'.json')
 if p.is_symlink():raise ValueError('PATH')
 return p

def focus_ids(uid,tasks,toggle=None):
 p=focus_file(uid);valid={t['id'] for t in tasks}
 today=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat()
 try:old=json.loads(p.read_text());values=[x for x in old.get('ids',[]) if x in valid][:3] if old.get('day')==today else []
 except FileNotFoundError:values=[]
 if toggle:
  if toggle not in valid:raise ValueError('STALE_TASK')
  if toggle in values:values.remove(toggle)
  elif len(values)<3:values.append(toggle)
  else:return values,False
  fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|getattr(os,'O_NOFOLLOW',0),0o600)
  with os.fdopen(fd,'w') as f:os.fchmod(f.fileno(),0o600);json.dump({'day':today,'ids':values},f)
 return values,True

async def render(slot,key,uid,chat):
 identity={'userId':uid,'chatId':chat}
 if key=='home':return '필요한 메뉴를 선택하세요. 자유롭게 질문해도 괜찮아요.',nav()
 if slot=='SOLO' and key=='reminders':
  data=await asyncio.to_thread(api,{'action':'MENU_DATA','slot':slot,**identity,'section':key});rows=data['reminders']
  lines=['내 다시 알림 · '+str(len(rows))+'건']
  for r in rows:
   when=dt.datetime.fromisoformat(r['dueAt'].replace('Z','+00:00')).astimezone(dt.timezone(dt.timedelta(hours=9))).strftime('%m월 %d일 %H:%M')
   lines.append(when+' · '+{'PENDING':'예약됨','CLAIMED':'발송 처리 중','UNKNOWN':'발송 결과 확인 필요'}.get(r['status'],'확인 필요'))
  lines.append('\n예약 취소·시간 설정은 모아온 → 업무비서 → 예약·알림에서 확인하세요.')
  return '\n'.join(lines),nav()
 if slot=='STUDY' and key in ('pending','settings'):
  data=await asyncio.to_thread(api,{'action':'MENU_DATA','slot':slot,**identity,'section':key})
  lines=['승인된 공유 지식: '+str(data['approvedCount'])+'개','최근 검토 대기: '+str(len(data['pending']))+'개 (최대 20개)']
  for r in data['pending']:lines.append('\n• '+r['title']+'\n출처: '+r['source'][:100])
  lines.append('\n모아온 → 업무비서 → 학습·지식에서 검토·승인할 수 있어요. 승인한 자료만 다른 비서가 활용합니다.')
  return '\n'.join(lines)[:3600],nav()
 if slot=='SOLO' and (key in ('tasks','focus','review') or re.fullmatch(r'[tf]:'+UUID,key)):
  data=await asyncio.to_thread(api,{'action':'PERSONAL_LIST',**identity});tasks=data['tasks']
  if key.startswith('t:'):
   t=next((t for t in tasks if t['id']==key[2:]),None)
   if not t:raise ValueError('STALE_TASK')
   actions=[('완료하기','p:C:'+t['id']+':'+str(t['revision']))]
   tomorrow=(dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()+dt.timedelta(days=1)).isoformat()
   if t['dueDate']<tomorrow:actions.append(('내일로 미루기','p:T:'+t['id']+':'+str(t['revision'])))
   return t['title']+'\n기한: '+t['dueDate']+'\n\n'+t['notes'][:2400],[actions,[('목록으로','tasks')],*nav()]
  focus,changed=await asyncio.to_thread(focus_ids,uid,tasks,key[2:] if key.startswith('f:') else None)
  if key=='focus' or key.startswith('f:'):
   text='오늘 집중할 일 · 최대 3개\n'+('\n'.join('✓ '+t['title'] for t in tasks if t['id'] in focus) or '아래 업무를 눌러 선택하세요.')
   if not changed:text+='\n이미 3개를 골랐어요. 하나를 해제한 뒤 선택하세요.'
   return text,[[(('✓ ' if t['id'] in focus else '')+t['title'][:32],'f:'+t['id'])] for t in tasks[:15]]+nav()
  text=data['displayName']+'님의 미완료 업무 · '+str(len(tasks))+'건 (최대 30건)\n'
  if key=='review':text+='오늘 마무리할 업무를 확인하세요. 항목을 눌러 완료하거나 내일로 미룰 수 있어요.\n'
  text+='\n'.join(t['dueDate']+' · '+t['title'][:65] for t in tasks[:12]) if tasks else '현재 미완료 업무가 없어요.'
  text+='\n조회: '+data['asOf']
  return text,[[(t['title'][:34],'t:'+t['id'])] for t in tasks[:15]]+nav()
 if slot=='SOLO' and re.fullmatch(r'p:[CT]:'+UUID+r':[1-9][0-9]{0,9}',key):
  _,verb,task,revision=key.split(':');v=await asyncio.to_thread(api,{'action':'PERSONAL_PREPARE',**identity,'id':task,'revision':int(revision),'verb':'COMPLETE' if verb=='C' else 'TOMORROW'})
  text=v['title']+'\n\n'+('이 업무를 완료할까요?' if v['verb']=='COMPLETE' else '기한을 '+v['dueDate']+'로 변경할까요?')+'\n확인 버튼을 누르면 모아온에 반영됩니다. (5분 이내)'
  return text,[[('확인 · 반영하기','c:'+v['confirmationId']),('취소','tasks')]]
 if slot=='SOLO' and re.fullmatch(r'c:'+UUID,key):
  v=await asyncio.to_thread(api,{'action':'PERSONAL_CONFIRM',**identity,'confirmationId':key[2:]})
  return ('완료 처리했어요.' if v['status']=='DONE' else '기한을 '+v['dueDate']+'로 변경했어요.')+'\n같은 확인 버튼을 반복해서 눌러도 중복 처리되지 않습니다.',[[('내 업무 보기','tasks')],*nav()]
 if slot=='WORK' and key in ('briefing','orders','cs','tasks'):
  d=await asyncio.to_thread(snapshot);sources=d.get('sources',{});lines=[]
  if key in ('briefing','orders'):
   lines.append('주문·배송 · 채널별 저장 현황')
   channels=sources.get('orders',{}).get('channels',[])
   if not channels:lines.append('주문 자료 확인 필요')
   for ch in channels:
    n=ch.get('counts') or {};lines.append(label(ch['platform'])+' · 발급 전 '+count(n.get('ACTIVE'))+' / 배송대기 '+count(n.get('REGISTER'))+' / 배송 중 '+count(n.get('IN_TRANSIT')))
  if key in ('briefing','cs'):
   lines.append('\n고객 문의')
   channels=sources.get('cs',{}).get('channels',[])
   if not channels:lines.append('문의 자료 확인 필요')
   for ch in channels:lines.append(label(ch['platform'])+' · 미답변 '+count(ch.get('unanswered')))
  if key in ('briefing','tasks'):
   n=sources.get('tasks',{}).get('counts') or {};lines.append('\n조회 키 발급자 업무 · 오늘 마감 '+count(n.get('dueToday'))+' / 기한 초과 '+count(n.get('overdue')))
  lines.extend(['\n조회: '+str(d.get('retrievedAt','확인 필요')),'모아온 저장 자료 기준입니다. 현재 채널을 실시간 재수집한 결과가 아니며 원본 수집 시각은 별도 확인이 필요합니다.'])
  return '\n'.join(lines),[[('주문·배송','orders'),('고객 문의','cs')],[('업무 현황','tasks')],*nav()]
 if key in ('knowledge','correct','quiz') and slot in ('WORK','STUDY'):
  result=await asyncio.to_thread(api,{'action':'CATALOG'});rows=result.get('items',[]) if isinstance(result,dict) else []
  text={'knowledge':'승인된 공유 지식','correct':'수정할 지식을 선택하세요. 현재 내용을 확인한 뒤 수정 내용·출처와 함께 새 등록안을 요청하세요.','quiz':'기억 테스트 · 자료를 선택하면 제목을 보고 핵심 내용을 떠올린 뒤 정답 원문을 확인할 수 있어요.'}[key]
  return text+('\n아직 승인된 자료가 없어요.' if not rows else ''),[[(r['title'][:38],('q:' if key=='quiz' else 'k:')+r['id'])] for r in rows[:20]]+nav()
 if slot in ('WORK','STUDY') and re.fullmatch(r'[kq]:'+UUID,key):
  r=await asyncio.to_thread(api,{'action':'ARTICLE','id':key[2:]});r=r.get('article',r)
  if not r or not r.get('body'):raise ValueError('ARTICLE_UNAVAILABLE')
  if key.startswith('q:'):return '기억 테스트\n'+r['title']+'\n\n이 자료의 핵심 기준을 떠올려 보세요. 내용을 설명한 뒤 아래 원문과 비교하세요.',[[('정답 원문·출처 확인','k:'+r['id'])],*nav()]
  return r['title']+'\n\n'+r['body'][:3000]+'\n\n승인된 공유 지식 · 변경 가능한 정보는 최신 확인이 필요합니다.',[[('지식 목록','knowledge')],*nav()]
 help_text={
  ('SOLO','memo'):'빠른 메모\n기억할 내용을 이 대화에 적어 주세요. 업무로 남기려면 “moaon-operations 스킬로 다음 내용을 업무 등록안으로 만들어 줘”와 기한을 함께 보내세요. 실제 업무 등록은 모아온 승인 후 이루어집니다.',
  ('SOLO','reminders'):'내 알림\n브리핑의 “1시간 뒤 다시 알림”으로 예약할 수 있어요. 현재 예약 시각 확인·취소와 발송 시간 변경은 모아온 → 업무비서 → 예약·알림에서 할 수 있습니다.',
  ('SOLO','settings'):'내 설정\n모아온 → 업무비서 → 텔레그램 봇에서 본인 계정 연결을 확인하세요. 봇 메뉴 탭에서는 표시할 메뉴와 순서를 바꿀 수 있습니다.',
  ('WORK','settings'):'알림 설정\n모아온 → 업무비서 → 예약·알림에서 오전 9시 브리핑, 요일, 수신처, 변화 알림을 설정하고 시험 발송할 수 있습니다. 봇 메뉴 탭에서 메뉴 순서도 바꿀 수 있어요.',
  ('STUDY','register'):'자료 등록\n제품 설명, 운영 지침, 답변 사례를 텍스트나 파일로 보내 주세요. 출처와 함께 “moaon-learning 스킬로 공유 지식 등록안으로 정리해 줘”라고 요청하세요. 모아온에서 검토·승인한 내용만 다른 비서가 활용합니다.',
  ('STUDY','pending'):'검토 대기\n모아온 → 업무비서 → 학습·지식 → 검토 대기에서 등록안의 내용·출처를 확인하고 수정·승인·반려할 수 있습니다. 승인 전에는 공유 지식에 반영되지 않아요.',
  ('STUDY','settings'):'학습 현황\n모아온 → 업무비서 → 학습·지식에서 승인된 지식과 검토 이력을 확인하세요. 이 기능은 자료를 저장하고 찾아 쓰는 방식이며 모델 자체를 재훈련하는 것은 아닙니다.'}
 if (slot,key) in help_text:return help_text[(slot,key)],nav()
 raise ValueError('UNKNOWN_MENU')

async def dispatch(adapter,update,context,callback=False):
 try:_,slot=scope()
 except ValueError:return False
 query=update.callback_query if callback else None
 msg=query.message if query else getattr(update,'effective_message',None)
 user=query.from_user if query else getattr(msg,'from_user',None)
 if not msg or not user or user.is_bot:return False
 uid=str(user.id);chat=str(msg.chat_id)
 if callback:
  key=(query.data or '')[6:]
 else:
  text=(msg.text or '').strip();key=next((k for k,label_ in CATALOG[slot] if text==label_),None)
  if text in ('메뉴','/moaon','/menu') or re.fullmatch(r'/(moaon|menu)@moaon_(hub|solo|study)_bot',text):key='home'
  if key is None:return False
 if not adapter._is_callback_user_authorized(uid,chat_id=msg.chat_id,chat_type=str(msg.chat.type),thread_id=str(msg.message_thread_id) if getattr(msg,'message_thread_id',None) else None,user_name=getattr(user,'first_name',None)):
  if query:await query.answer('이 봇을 사용할 권한이 없습니다.',show_alert=True)
  return bool(query)
 # An exact menu selection is an explicit action even in the configured WORK
 # group. Native user authorization + current server chat/allowlist still gate it.
 if query:await query.answer()
 try:
  menu=await asyncio.to_thread(api,{'action':'MENU_OPEN','slot':slot,'userId':uid,'chatId':chat})
  base=key if ':' not in key else ('tasks' if key[0] in 'tpc' else 'focus' if key[0]=='f' else 'quiz' if key[0]=='q' else 'knowledge')
  permitted=base in menu['items'] or base=='knowledge' and bool(set(menu['items'])&{'correct','quiz'}) or base=='tasks' and bool(set(menu['items'])&{'review','focus'})
  if key!='home' and not permitted:raise ValueError('MENU_DISABLED')
  if key=='home':
   from telegram import ReplyKeyboardMarkup
   k=keyboard(slot,menu['items']);await msg.reply_text('모아온 '+{'WORK':'업무비서','SOLO':'개인비서','STUDY':'지식비서'}[slot]+'\n아래 메뉴에서 필요한 일을 골라 주세요.',reply_markup=ReplyKeyboardMarkup(**k));return True
  text,rows=await render(slot,key,uid,chat)
  if query and not key.startswith('c:'):
   try:await query.edit_message_text(text,reply_markup=inline(rows))
   except Exception as error:
    from telegram.error import BadRequest
    if not isinstance(error,BadRequest) or 'message is not modified' not in str(error).lower():raise
  else:await msg.reply_text(text,reply_markup=inline(rows))
 except Exception:
  # Do not reveal server responses, keys, SQL, file paths or Telegram token URLs.
  await msg.reply_text('처리 결과 확인이 필요해요. 잠시 뒤 메뉴를 다시 열어 주세요. 내 업무는 모아온의 본인 계정 연결이 필요하며, 오래되거나 변경된 업무는 다시 조회해야 합니다.',reply_markup=inline(nav()))
 return True

def register(adapter,app):
 from telegram.ext import MessageHandler,filters,ApplicationHandlerStop
 async def on_message(update,context):
  if await dispatch(adapter,update,context):raise ApplicationHandlerStop
 app.add_handler(MessageHandler(filters.TEXT,on_message),group=-2)
