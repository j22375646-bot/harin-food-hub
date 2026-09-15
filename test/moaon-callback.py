import unittest,importlib.util,asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock,patch
spec=importlib.util.spec_from_file_location('cb','public/integrations/moaon-callback.py');cb=importlib.util.module_from_spec(spec);spec.loader.exec_module(cb)
class CallbackTests(unittest.IsolatedAsyncioTestCase):
 def event(self,data='moa:S:44444444-4444-4444-8444-444444444444'):
  msg=SimpleNamespace(chat_id=123,chat=SimpleNamespace(type='private'),message_id=456,reply_text=AsyncMock())
  q=SimpleNamespace(data=data,message=msg,from_user=SimpleNamespace(id=123,is_bot=False,first_name='test'),answer=AsyncMock())
  return SimpleNamespace(callback_query=q)
 async def test_denied_user_never_reaches_server(self):
  u=self.event()
  with patch.object(cb,'execute') as execute:await cb.handle(SimpleNamespace(_is_callback_user_authorized=lambda *a,**k:False),u,None);execute.assert_not_called()
 async def test_malformed_button_never_reaches_server(self):
  u=self.event('moa:S:invalid')
  with patch.object(cb,'execute') as execute:await cb.handle(None,u,None);execute.assert_not_called()
 async def test_canonical_identity_and_safe_failure(self):
  u=self.event();a=SimpleNamespace(_is_callback_user_authorized=lambda *a,**k:True)
  with patch.object(cb,'execute',return_value={'kind':'SNOOZE','status':'PENDING'}) as execute:
   await cb.handle(a,u,None);self.assertEqual(execute.call_args.args[0]['userId'],'123');self.assertEqual(execute.call_args.args[0]['messageId'],'456');self.assertIn('추가 예약되지',u.callback_query.message.reply_text.call_args.args[0])
  with patch.object(cb,'execute',side_effect=ValueError('secret-do-not-show')):
   await cb.handle(a,u,None);self.assertNotIn('secret-do-not-show',u.callback_query.message.reply_text.call_args.args[0])
if __name__=='__main__':unittest.main()
