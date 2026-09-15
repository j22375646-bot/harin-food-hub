#!/bin/sh
set -eu
# Moaon managed installer: only its own service and timer are created.
[ "$(id -u)" = 0 ] || { echo 'Run from the existing root SSH terminal.'; exit 1; }
for unit in /etc/systemd/system/moaon-assistant.service /etc/systemd/system/moaon-assistant.timer; do
  if [ -e "$unit" ] && ! grep -q 'Moaon managed automation' "$unit"; then echo 'Existing unmanaged unit; stopped.'; exit 1; fi
done
su - hermes -c 'podman exec --user hermes hermes-agent curl -fsS https://harin-cafe24-sync.vercel.app/integrations/moaon-automation.py -o /tmp/moaon-automation.py'
su - hermes -c 'podman exec --user hermes hermes-agent /opt/hermes/.venv/bin/python /tmp/moaon-automation.py --install'
su - hermes -c 'podman exec --user hermes hermes-agent curl -fsS https://harin-cafe24-sync.vercel.app/integrations/moaon-bots.py -o /opt/data/integrations/moaon/bots.py'
su - hermes -c 'podman exec --user hermes hermes-agent chmod 600 /opt/data/integrations/moaon/bots.py'
user_id=$(id -u hermes)
cat > /etc/systemd/system/moaon-assistant.service <<EOF
# Moaon managed automation
[Unit]
Description=Moaon assistant scheduled check
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
User=hermes
Environment=XDG_RUNTIME_DIR=/run/user/$user_id
ExecStart=/usr/bin/podman exec --user hermes hermes-agent /opt/hermes/.venv/bin/python /opt/data/integrations/moaon/automation.py --tick
TimeoutStartSec=300
EOF
cat > /etc/systemd/system/moaon-assistant.timer <<'EOF'
# Moaon managed automation
[Unit]
Description=Moaon assistant every two minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
AccuracySec=15s
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now moaon-assistant.timer
systemctl start moaon-assistant.service
systemctl is-active moaon-assistant.timer
printf 'Installed. Recipient and delivery switches are managed in Moaon.\n'
