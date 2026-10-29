#!/usr/bin/env bash
# Publica o pacote extraído ao lado deste script em /home/deployer/vistoria.
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 22

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="${APP:-/home/deployer/vistoria}"

rm -rf "$APP/sites"
mkdir -p "$APP/sites" "$APP/api"
cp -a "$ROOT/sites/." "$APP/sites/"
rm -rf "$APP/api/src"
cp -a "$ROOT/api-src" "$APP/api/src"

python3 - << 'PY'
from pathlib import Path
p = Path("/home/deployer/vistoria/api/.env")
origem = "https://vistoria.dimensionalengenharia.com"
texto = p.read_text()
linhas = []
for linha in texto.splitlines():
    if linha.startswith("CORS_ORIGIN="):
        partes = [item.strip() for item in linha.split("=", 1)[1].split(",") if item.strip()]
        if origem not in partes:
            partes.append(origem)
        linha = "CORS_ORIGIN=" + ",".join(partes)
    linhas.append(linha)
p.write_text("\n".join(linhas) + "\n")
PY

cd "$APP"
if [ ! -d node_modules/express ] && [ ! -d api/node_modules/express ]; then
  npm install --omit=dev -w vistoria-api
fi

if pm2 describe vistoria-api >/dev/null 2>&1; then
  pm2 restart vistoria-api --update-env
else
  pm2 start npm --name vistoria-api --cwd "$APP/api" -- start
fi
pm2 save

sudo cp "$ROOT/vistoria.nginx.conf" /etc/nginx/sites-available/vistoria
sudo ln -sf /etc/nginx/sites-available/vistoria /etc/nginx/sites-enabled/vistoria
sudo nginx -t
sudo systemctl reload nginx

if ! sudo certbot --nginx -d vistoria.dimensionalengenharia.com --redirect --non-interactive --agree-tos; then
  sudo certbot --nginx -d vistoria.dimensionalengenharia.com --redirect --non-interactive --agree-tos --register-unsafely-without-email
fi

echo "==> vistoria no ar"
