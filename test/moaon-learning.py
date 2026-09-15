import importlib.util,unittest,uuid
spec=importlib.util.spec_from_file_location('learning','public/integrations/moaon-learning.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class LearningTest(unittest.TestCase):
 def test_id_generated_and_reused(self):
  value={'id':None,'title':'test','body':'facts','source':'document','targetId':None,'baseRevision':0};calls=[]
  def command(p):calls.append(p);return {'id':p['id'],'status':'PENDING'}
  a=m.submit(value,command);b=m.submit(value,command)
  self.assertEqual(a,b);self.assertEqual(uuid.UUID(a['id']).version,4);self.assertEqual(calls[0]['action'],'LEARN_SUBMIT')
 def test_rejects_extra_fields(self):
  with self.assertRaises(ValueError):m.submit({'token':'secret'},lambda _:self.fail('called'))
if __name__=='__main__':unittest.main()
