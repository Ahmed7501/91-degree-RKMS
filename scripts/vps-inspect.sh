#!/usr/bin/env bash
# READ-ONLY VPS inventory (DEPLOYMENT §2). Changes nothing. Send the output to the developer with
# any secrets removed. Run with:  bash vps-inspect.sh 2>&1 | tee vps-inspect.txt
set -u

section() { printf '\n===== %s =====\n' "$1"; }

section "System"
uname -a
head -3 /etc/os-release 2>/dev/null
free -h
df -h /
nproc

section "Docker"
docker --version
docker compose version

section "Containers (names, images, published ports, status)"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'

section "Compose projects"
docker compose ls 2>/dev/null || true

section "Networks"
docker network ls

section "Volumes (names only)"
docker volume ls --format '{{.Name}}' | head -50

section "Listening TCP ports"
sudo ss -tlnp 2>/dev/null | awk 'NR==1 || /LISTEN/' || ss -tln

section "Who owns ports 80 and 443?"
sudo ss -tlnp 2>/dev/null | grep -E ':(80|443)\s' || echo "(nothing reported)"

section "Traefik containers (if any) and their entrypoints/resolvers"
for c in $(docker ps --format '{{.Names}}' | grep -i traefik); do
  echo "--- $c"
  docker inspect "$c" --format '{{range .Config.Cmd}}{{println .}}{{end}}' | grep -Ei 'entrypoints|certificatesresolvers|providers.docker' || true
  docker inspect "$c" --format '{{range $k, $v := .NetworkSettings.Networks}}network: {{$k}}{{println}}{{end}}'
done

section "Host nginx / Caddy"
systemctl is-active nginx 2>/dev/null && echo "nginx: active" || echo "nginx: not active"
systemctl is-active caddy 2>/dev/null && echo "caddy: active" || echo "caddy: not active"
ls /etc/nginx/sites-enabled 2>/dev/null || true

section "Time zone and clock"
timedatectl 2>/dev/null | grep -Ei 'time zone|synchronized' || date

section "Done"
echo "Nothing was changed. Remove any secrets before sharing this output."
