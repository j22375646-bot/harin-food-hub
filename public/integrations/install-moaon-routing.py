"""Limit a named Moaon gateway to its own transport and explicitly routed members."""
from pathlib import Path
import hashlib,os
p=Path('/opt/hermes/gateway/run.py')
if p.is_symlink():raise SystemExit('ROUTER_LINK_REFUSED')
s=p.read_text();marker='# Moaon named routing v1'
old='''    return list(
        profiles_to_serve(
            multiplex=True,
            profile_allowlist=getattr(config, "multiplex_profile_allowlist", None),
        )
    )'''
new='''    # Moaon named routing v1
    homes = list(
        profiles_to_serve(
            multiplex=True,
            profile_allowlist=getattr(config, "multiplex_profile_allowlist", None),
        )
    )
    from hermes_cli.profiles import get_active_profile_name, get_profile_dir
    active = get_active_profile_name()
    if active in ("moaon-work", "moaon-solo", "moaon-study", "moaon-sup", "moaon-ad") and (get_profile_dir(active) / ".moaon-managed-profile").is_file():
        # Never start the default bot or another role's transport a second time.
        return [(active, get_profile_dir(active))] + [(n, h) for n, h in homes if n.startswith(active + "-u") and (h / ".moaon-member-profile").is_file()]
    return homes'''
if marker in s:
 if s.count(new)!=1:raise SystemExit('ROUTER_DRIFT')
 print('MOAON_ROUTER_PRESENT')
else:
 if s.count(old)!=1:raise SystemExit('ROUTER_COMPATIBILITY_REQUIRED')
 backup=Path('/opt/data/integrations/moaon')/('gateway-before-routing-'+hashlib.sha256(s.encode()).hexdigest()[:16]+'.py')
 if not backup.exists():backup.write_text(s);backup.chmod(0o600)
 updated=s.replace(old,new);compile(updated,str(p),'exec')
 tmp=p.with_suffix('.moaon-next');tmp.write_text(updated);tmp.chmod(p.stat().st_mode&0o777);os.replace(tmp,p)
 print('MOAON_ROUTER_INSTALLED')
