import asyncio,importlib.util,json,sys,types,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('menu',Path(__file__).parents[1]/'public/integrations/moaon-menu.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
ID='33333333-3333-4333-8333-333333333333'
class Button:
 def __init__(self,text,**kw):self.text=text;self.kw=kw
class Markup:
 def __init__(self,rows=None,**kw):self.rows=rows;self.kw=kw
sys.modules['telegram']=types.SimpleNamespace(InlineKeyboardButton=Button,InlineKeyboardMarkup=Markup,ReplyKeyboardMarkup=Markup)
class Message:
 def __init__(self,text=''):
  self.text=text;self.chat_id=123;self.chat=types.SimpleNamespace(type='private');self.from_user=types.SimpleNamespace(id=123,is_bot=False,first_name='test');self.replies=[]
 async def reply_text(self,text,**kw):self.replies.append((text,kw))
class Query:
 def __init__(self,msg,key):self.message=msg;self.from_user=msg.from_user;self.data='moa:m:'+key;self.edits=[]
 async def answer(self,*a,**kw):pass
 async def edit_message_text(self,text,**kw):self.edits.append((text,kw))
class Tests(unittest.IsolatedAsyncioTestCase):
 async def test_authorization_and_nonmenu_passthrough(self):
  adapter=types.SimpleNamespace(_is_callback_user_authorized=lambda *a,**kw:False,_should_process_message=lambda *a,**kw:True)
  msg=Message('☀️ 오늘 내 업무');update=types.SimpleNamespace(effective_message=msg,callback_query=None)
  with patch.object(m,'scope',return_value=(Path('/unused'),'SOLO')),patch.object(m,'api') as api:
   self.assertFalse(await m.dispatch(adapter,update,None));api.assert_not_called()
   adapter._is_callback_user_authorized=lambda *a,**kw:True;msg.text='일반 대화';self.assertFalse(await m.dispatch(adapter,update,None));api.assert_not_called()
 async def test_task_prepare_does_not_complete_and_confirm_is_scoped(self):
  calls=[]
  def api(v):
   calls.append(v)
   if v['action']=='MENU_OPEN':return {'items':['tasks']}
   if v['action']=='PERSONAL_PREPARE':return {'title':'시험 업무','confirmationId':ID,'verb':'COMPLETE','dueDate':'2026-09-16'}
   if v['action']=='PERSONAL_CONFIRM':return {'status':'DONE'}
   raise AssertionError(v)
  adapter=types.SimpleNamespace(_is_callback_user_authorized=lambda *a,**kw:True)
  msg=Message();query=Query(msg,'p:C:'+ID+':4');u=types.SimpleNamespace(callback_query=query)
  with patch.object(m,'scope',return_value=(Path('/unused'),'SOLO')),patch.object(m,'api',side_effect=api):
   await m.dispatch(adapter,u,None,True)
   self.assertEqual([x['action'] for x in calls],['MENU_OPEN','PERSONAL_PREPARE']);self.assertIn('완료할까요',query.edits[0][0]);self.assertEqual(msg.replies,[])
   confirm=query.edits[0][1]['reply_markup'].rows[0][0].kw['callback_data'];self.assertLessEqual(len(confirm.encode()),64)
   query.data=confirm;await m.dispatch(adapter,u,None,True);self.assertEqual(calls[-1],{'action':'PERSONAL_CONFIRM','userId':'123','chatId':'123','confirmationId':ID});self.assertIn('완료 처리',msg.replies[-1][0])
 async def test_disabled_menu_and_errors_no_secret_output(self):
  adapter=types.SimpleNamespace(_is_callback_user_authorized=lambda *a,**kw:True)
  msg=Message();u=types.SimpleNamespace(callback_query=Query(msg,'tasks'));calls=[]
  def api(v):calls.append(v);return {'items':['settings']}
  with patch.object(m,'scope',return_value=(Path('/unused'),'SOLO')),patch.object(m,'api',side_effect=api):
   await m.dispatch(adapter,u,None,True);self.assertEqual(len(calls),1);self.assertIn('확인',msg.replies[0][0])
 async def test_saved_data_missing_not_zero_and_catalog_shape(self):
  with patch.object(m,'snapshot',return_value={'sources':{},'retrievedAt':'test'}):
   text,rows=await m.render('WORK','briefing','123','123');self.assertIn('확인 필요',text);self.assertNotIn('0건',text)
  with patch.object(m,'api',return_value={'items':[{'id':ID,'title':'제품 시험'}]}):
   text,rows=await m.render('STUDY','knowledge','123','123');self.assertEqual(rows[0][0],('제품 시험','k:'+ID))
 async def test_specialists_use_saved_evidence_and_stale_health(self):
  with patch.object(m,'api',return_value={'workerSeenAt':None,'bots':[{'slot':'SUP','status':'RUNNING','checkedAt':None}]}):
   text,rows=await m.render('SUP','health','123','123');self.assertIn('최근 상태 확인 필요',text);self.assertNotIn('실행 중',text)
  with patch.object(m,'snapshot',return_value={'sources':{}}):
   text,rows=await m.render('AD','reports','123','123');self.assertIn('확인 가능한 보고서가 없습니다',text)
  with patch.object(m,'snapshot',return_value={'sources':{'reports':{'status':'READY','items':[{'title':'시험 보고서','periodStart':'2026-09-01','periodEnd':'2026-09-07','detail':{'sections':[{'items':[{'title':'판단 보류','body':'비용 확인 필요'}]}]}}]}}}):
   text,rows=await m.render('AD','reports','123','123');self.assertIn('시험 보고서',text);self.assertIn('비용 확인 필요',text);self.assertNotIn('"sections"',text)
 async def test_ad_revision_binds_identity(self):
  calls=[]
  def api(v):calls.append(v);return {}
  with patch.object(m,'api',side_effect=api):
   text,rows=await m.render('AD','revise:'+ID,'123','123');self.assertIn('원본',text);self.assertEqual(calls,[{'action':'ADS_REVISE','userId':'123','chatId':'123','id':ID}]);self.assertLessEqual(len(('moa:m:revise:'+ID).encode()),64)
 async def test_ad_revision_comparison_text(self):
  job={'id':ID,'start_date':'2026-09-01','end_date':'2026-09-07','status':'SUCCEEDED','delivery':'SENT','summary':{'status':'OBSERVED','metrics':{'cost':120,'clicks':10,'conversions':1,'revenue':250,'roas':250},'revisionComparison':{'reason':'수치 갱신','caveat':'같은 기간 재조회','rows':[{'label':'ROAS','before':200,'after':250,'delta':50,'unit':'%p','state':'CHANGED'}]}}}
  with patch.object(m,'api',return_value={'jobs':[job]}):
   text,rows=await m.render('AD','report:'+ID,'123','123');self.assertIn('+50%p',text);self.assertIn('같은 기간 재조회',text)
 def test_keyboard_and_callbacks_fit(self):
  for slot,entries in m.CATALOG.items():
   k=m.keyboard(slot,[x[0] for x in entries]);self.assertEqual(len(k['keyboard']),(len(entries)+1)//2);self.assertTrue(k['is_persistent'])
  self.assertLessEqual(len(('moa:m:p:C:'+ID+':2147483646').encode()),64)
if __name__=='__main__':unittest.main()
