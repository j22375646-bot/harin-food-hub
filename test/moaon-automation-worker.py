import unittest, importlib.util, datetime as dt
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('worker','public/integrations/moaon-automation.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
class WorkerTest(unittest.TestCase):
 def test_schedule_window_and_days(self):
  s={'schedule':True,'time':'09:00','days':[0]}
  self.assertTrue(w.due(s,dt.datetime(2026,9,14,9,2)))
  self.assertFalse(w.due(s,dt.datetime(2026,9,14,9,10)))
  self.assertFalse(w.due(s,dt.datetime(2026,9,15,9,2)))
 def test_missing_is_not_zero_and_first_is_baseline(self):
  self.assertEqual(w.counts({'sources':{'orders':{'channels':[{'platform':'NAVER','counts':None}]}}}),{})
  self.assertEqual(w.increased({}, {'order:NAVER':8}),{})
  self.assertEqual(w.increased({'order:NAVER':3},{'order:NAVER':5}),{'order:NAVER':2})
 def test_unclaimed_never_sends(self):
  with patch.object(w,'command',return_value={'claimed':False}),patch.object(w,'telegram') as send:w.deliver(None,'x',{'revision':1,'slot':'WORK','botRevision':1},'e','TEST','m');send.assert_not_called()
 def test_network_ambiguity_no_retry(self):
  with patch.object(w,'command',side_effect=[{'claimed':True,'chatId':'1'},{'id':'card'},{}]) as cmd,patch.object(w,'telegram',side_effect=TimeoutError()) as send:
   w.deliver(None,'x',{'revision':1,'slot':'WORK','botRevision':1},'e','TEST','m');self.assertEqual(send.call_count,1);self.assertEqual(cmd.call_args.args[2]['status'],'UNKNOWN')
 def test_bot_sections_are_isolated(self):
  data={'sources':{'orders':{'channels':[{'platform':'NAVER','counts':{'ACTIVE':3}}]},'tasks':{'counts':{'dueToday':2,'overdue':1}}}}
  self.assertEqual(w.section_counts(data,['tasks']),{'tasks:dueToday':2,'tasks:overdue':1})
  self.assertNotIn('네이버',w.briefing(data,['tasks'],'SOLO'))
  self.assertNotIn('키 발급자 업무',w.briefing(data,['orders'],'WORK'))
  self.assertIn('문의 자료 확인 필요',w.briefing({},['cs'],'WORK'))
 def test_sent_but_binding_failed_is_unknown(self):
  with patch.object(w,'command',side_effect=[{'claimed':True,'chatId':'1'},{'id':'card'},ValueError('bind failed'),{}]) as cmd,patch.object(w,'telegram',return_value='123') as send:
   w.deliver(None,'x',{'revision':1,'slot':'WORK','botRevision':1},'e','TEST','m');self.assertEqual(send.call_count,1);self.assertEqual(cmd.call_args.args[2]['status'],'UNKNOWN')
 def test_reminder_claim_prevents_duplicate_send(self):
  with patch.object(w,'command',side_effect=[{'due':[{'id':'job','slot':'WORK'}]},{'claimed':False}]),patch.object(w,'telegram') as send:
   w.send_reminders(None,'x',[{'slot':'WORK','revision':1}]);send.assert_not_called()
if __name__=='__main__':unittest.main()
