"""Install a narrow callback bridge; verify source shape, retain the original."""
from pathlib import Path
import hashlib,os,sys
p=Path('/opt/hermes/plugins/platforms/telegram/adapter.py')
if p.is_symlink():raise SystemExit('ADAPTER_LINK_REFUSED')
s=p.read_text();marker='# Moaon callback bridge v1'
needle='        data = query.data\n        query_message = getattr(query, "message", None)'
bridge='''        data = query.data
        # Moaon callback bridge v1
        if data.startswith("moa:"):
            import importlib.util as _moaon_import
            _moaon_spec = _moaon_import.spec_from_file_location("moaon_callback", "/opt/data/integrations/moaon/callback.py")
            _moaon_module = _moaon_import.module_from_spec(_moaon_spec)
            _moaon_spec.loader.exec_module(_moaon_module)
            await _moaon_module.handle(self, update, context)
            return
        query_message = getattr(query, "message", None)'''
if marker in s:
    if s.count(bridge)!=1:raise SystemExit('ADAPTER_BRIDGE_DRIFT')
    print('CALLBACK_BRIDGE_PRESENT');raise SystemExit(0)
if s.count(needle)!=1 or 'def _is_callback_user_authorized(' not in s:raise SystemExit('ADAPTER_COMPATIBILITY_CHECK_REQUIRED')
if '--check' in sys.argv:print('CALLBACK_BRIDGE_COMPATIBLE');raise SystemExit(0)
root=Path('/opt/data/integrations/moaon');backup=root/('adapter-before-'+hashlib.sha256(s.encode()).hexdigest()[:16]+'.py')
if not backup.exists():backup.write_text(s);backup.chmod(0o600)
new=s.replace(needle,bridge);compile(new,str(p),'exec');tmp=p.with_suffix('.moaon-next');tmp.write_text(new);tmp.chmod(p.stat().st_mode & 0o777);os.replace(tmp,p)
print('CALLBACK_BRIDGE_INSTALLED')
