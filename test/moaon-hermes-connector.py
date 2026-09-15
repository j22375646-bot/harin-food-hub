import importlib.util, unittest, json
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('connector','public/integrations/moaon-hermes.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class Checks(unittest.TestCase):
 def test_bad_key_never_calls_network(self):
  with patch.object(c.urllib.request,'build_opener') as opener:
   with self.assertRaises(ValueError):c.read('bad')
   opener.assert_not_called()
 def test_fixed_url_and_scope_data(self):
  data={'ok':True,'writePolicy':'READ_ONLY','sources':{'orders':{'status':'READY'}}}
  with patch.object(c.urllib.request,'build_opener') as opener:
   opener.return_value.open.return_value.__enter__.return_value.read.return_value=json.dumps(data).encode()
   self.assertEqual(c.read('moaon_ro_'+'a'*43),data)
   args,kw=opener.return_value.open.call_args
   self.assertEqual(args[0].full_url,c.URL);self.assertEqual(args[0].get_method(),'GET');self.assertEqual(kw['timeout'],30)
 def test_redirect_denied(self):
  self.assertIsNone(c.NoRedirect().redirect_request(None,None,302,'x',{},'https://evil.example'))
if __name__=='__main__':unittest.main()
