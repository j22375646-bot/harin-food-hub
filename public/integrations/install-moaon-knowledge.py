"""Install only the owned read-only company knowledge plugin. Run as container root."""
from pathlib import Path
import os,hashlib

source=Path('/tmp/moaon-company-knowledge.py')
root=Path('/opt/hermes/plugins/moaon_company_knowledge')
marker=root/'.moaon-managed'
if source.is_symlink() or root.is_symlink() or root.exists() and not marker.is_file():raise SystemExit('UNMANAGED_PLUGIN_REFUSED')
text=source.read_text(encoding='utf-8');compile(text,str(source),'exec')
root.mkdir(mode=0o755,exist_ok=True)
for name,value in [('__init__.py',text),('plugin.yaml','name: moaon-company-knowledge\nversion: 1.0.0\ndescription: Live read-only Harin company knowledge\nauthor: Moaon\nkind: backend\nprovides_tools:\n  - moaon_company_knowledge\n'),('.moaon-managed','1\n')]:
    p=root/name
    if p.is_symlink():raise SystemExit('PLUGIN_LINK_REFUSED')
    tmp=root/(name+'.next');tmp.write_text(value,encoding='utf-8');tmp.chmod(0o644);os.replace(tmp,p)
print('MOAON_KNOWLEDGE_INSTALLED '+hashlib.sha256(text.encode()).hexdigest()[:12])
