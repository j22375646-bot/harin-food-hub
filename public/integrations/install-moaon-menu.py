"""Install idempotent menu registration alongside native Hermes handlers."""
from pathlib import Path
import hashlib,os,sys
p=Path('/opt/hermes/plugins/platforms/telegram/adapter.py')
if p.is_symlink():raise SystemExit('ADAPTER_LINK_REFUSED')
s=p.read_text();marker='# Moaon menu bridge v1'
needle='        app.add_handler(TelegramMessageHandler(\n            filters.TEXT & ~filters.COMMAND,'
bridge='''        # Moaon menu bridge v1
        import importlib.util as _moaon_menu_import
        _moaon_menu_spec = _moaon_menu_import.spec_from_file_location("moaon_menu", "/opt/data/integrations/moaon/menu.py")
        _moaon_menu_module = _moaon_menu_import.module_from_spec(_moaon_menu_spec)
        _moaon_menu_spec.loader.exec_module(_moaon_menu_module)
        _moaon_menu_module.register(self, app)
        app.add_handler(TelegramMessageHandler(
            filters.TEXT & ~filters.COMMAND,'''
if marker in s:
 if s.count(bridge)!=1:raise SystemExit('ADAPTER_MENU_DRIFT')
 print('MENU_BRIDGE_PRESENT');raise SystemExit(0)
if s.count(needle)!=1 or 'def _is_callback_user_authorized(' not in s:raise SystemExit('ADAPTER_COMPATIBILITY_CHECK_REQUIRED')
if '--check' in sys.argv:print('MENU_BRIDGE_COMPATIBLE');raise SystemExit(0)
root=Path('/opt/data/integrations/moaon');backup=root/('adapter-before-menu-'+hashlib.sha256(s.encode()).hexdigest()[:16]+'.py')
if not backup.exists():backup.write_text(s);backup.chmod(0o600)
new=s.replace(needle,bridge);compile(new,str(p),'exec');tmp=p.with_suffix('.moaon-next');tmp.write_text(new);tmp.chmod(p.stat().st_mode & 0o777);os.replace(tmp,p)
print('MENU_BRIDGE_INSTALLED')
