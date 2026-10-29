#!/usr/bin/env bash
# Roda na VPS pelo GitHub Actions, em /home/deployer/vistoria.
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22

APP_DIR="${APP_DIR:-/home/deployer/vistoria}"
cd "$APP_DIR"

if [ ! -d .git ]; then
  echo "A pasta ainda não é um clone. Na VPS, como deployer:" >&2
  echo "  git clone git@github.com:dimensionalengenharia/vistoria.git /home/deployer/vistoria" >&2
  exit 1
fi

echo "==> git fetch/reset"
rm -f .git/refs/remotes/origin/main.lock 2>/dev/null || true
git update-ref -d refs/remotes/origin/main 2>/dev/null || true
git fetch origin main
git reset --hard FETCH_HEAD
git update-ref refs/remotes/origin/main FETCH_HEAD 2>/dev/null || true

if [ ! -f api/.env ]; then
  echo "Falta /home/deployer/vistoria/api/.env na VPS. Esse arquivo não vai para o GitHub." >&2
  exit 1
fi

if [ -f release.tgz ]; then
  echo "==> painel e aplicativo"
  rm -rf release web/dist pwa/dist
  tar -xzf release.tgz
  mv release/web web/dist
  mv release/pwa pwa/dist
  rm -rf release release.tgz
fi

echo "==> npm ci"
npm ci --omit=dev --no-audit --no-fund

echo "==> pm2"
if pm2 describe vistoria-api >/dev/null 2>&1; then
  pm2 restart vistoria-api --update-env
else
  pm2 start npm --name vistoria-api --cwd "$APP_DIR/api" -- start
fi
pm2 save
echo "==> deploy ok"
