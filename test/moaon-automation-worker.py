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
  with patch.object(w,'command',return_value={'claimed':False}),patch.object(w,'telegram') as send:w.deliver(None,'x',{'revision':1},'e','TEST','m');send.assert_not_called()
 def test_network_ambiguity_no_retry(self):
  with patch.object(w,'command',side_effect=[{'claimed':True,'chatId':'1'},{}]) as cmd,patch.object(w,'telegram',side_effect=TimeoutError()) as send:
   w.deliver(None,'x',{'revision':1},'e','TEST','m');self.assertEqual(send.call_count,1);self.assertEqual(cmd.call_args.args[2]['status'],'UNKNOWN')
if __name__=='__main__':unittest.main()
