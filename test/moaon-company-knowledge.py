import hashlib,importlib.util,tempfile,unittest,zipfile
from pathlib import Path
from xml.sax.saxutils import escape
s=importlib.util.spec_from_file_location('knowledge','public/integrations/moaon-company-knowledge.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Tests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(dir='D:/GPT/tmp');self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)/'company';self.root.mkdir();self.skills=Path(self.temp.name)/'skills';self.skills.mkdir()
 def publish(self,text,version='5.0'):
  p=self.root/('기준서 '+version+'.docx')
  with zipfile.ZipFile(p,'w') as z:z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+escape(text)+'</w:t></w:r></w:p></w:body></w:document>')
  (self.root/'LATEST.md').write_text('- 현재 적용 버전: '+version+'\n- 절대 경로: '+str(p)+'\n- SHA-256: '+hashlib.sha256(p.read_bytes()).hexdigest(),encoding='utf-8');return p
 def search(self,q):return m.search(q,self.root,self.skills)
 def test_next_query_reads_updated_source_and_removed_index_never_falls_back(self):
  self.publish('작두콩차 고객 안내 기준은 첫번째예요');a=self.search('작두콩차');self.assertIn('첫번째',a['results'][0]['excerpt'])
  self.publish('작두콩차 고객 안내 기준은 두번째예요','6.0');b=self.search('작두콩차');self.assertIn('두번째',b['results'][0]['excerpt']);self.assertNotEqual(a['sources'][0]['sha256'],b['sources'][0]['sha256']);self.assertNotIn('첫번째',str(b))
  (self.root/'LATEST.md').unlink();self.assertEqual(self.search('작두콩차')['results'],[])
 def test_changed_file_blocks_stale_manifest(self):
  p=self.publish('작두콩차 기준');p.write_bytes(p.read_bytes()+b'changed');r=self.search('작두콩차');self.assertEqual(r['status'],'PARTIAL');self.assertEqual(r['results'],[]);self.assertEqual(r['errors'][0]['code'],'LATEST_HASH_MISMATCH')
 def test_private_paths_and_personal_memories_are_not_searchable(self):
  outside=Path(self.temp.name)/'USER.md';outside.write_text('사적인 기억',encoding='utf-8');self.publish('공개 작두콩차 기준');self.assertNotIn('사적인 기억',str(self.search('기억')))
  p=Path(self.temp.name)/'secret.docx';p.write_bytes(b'secret');(self.root/'LATEST.md').write_text('- 절대 경로: '+str(p)+'\n- SHA-256: '+hashlib.sha256(p.read_bytes()).hexdigest(),encoding='utf-8');self.assertEqual(self.search('secret')['errors'][0]['code'],'OUTSIDE_COMPANY_SOURCE')
 def test_secret_paragraph_is_redacted_and_draft_metadata_preserved(self):
  self.publish('키 123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');index=self.root/'LATEST.md';index.write_text(index.read_text(encoding='utf-8')+'\n- 상태: 검토용 초안 / 미승인',encoding='utf-8');r=self.search('기준');self.assertIn('미승인',r['sources'][0]['metadata']);self.assertNotIn('AAAAAAAAAAAA',str(r))
 def test_multiformat_index_reads_current_markdown_not_history(self):
  current=self.root/'current.md';current.write_text('키워드 최신 승인 기준',encoding='utf-8');old=self.root/'old.md';old.write_text('키워드 옛날 초안',encoding='utf-8')
  index='# 현황\n## 1. 현재 적용 중인 최신 승인본\n- 상태: 승인본 / 적용\n### Markdown 승인본\n- 경로: '+str(current)+'\n- 크기: 40 bytes\n- SHA-256: '+hashlib.sha256(current.read_bytes()).hexdigest()+'\n## 2. 이전 검토본\n- 경로: '+str(old)+'\n- SHA-256: '+hashlib.sha256(old.read_bytes()).hexdigest()
  (self.root/'PROGRAM_LATEST.md').write_text(index,encoding='utf-8');r=self.search('키워드');self.assertEqual(r['status'],'READY');self.assertIn('최신 승인',r['results'][0]['excerpt']);self.assertNotIn('옛날',str(r));self.assertNotIn('이전 검토본',str(r))
 def test_arguments_and_chunk_size(self):
  for q in ['',None,'a'*301]:self.assertRaises(ValueError,self.search,q)
  self.publish('작두콩차 '*2000);r=self.search('작두콩차');self.assertLessEqual(len(r['results']),6);self.assertTrue(all(len(x['excerpt'])<=1301 for x in r['results']))
if __name__=='__main__':unittest.main()
