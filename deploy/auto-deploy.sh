#!/usr/bin/env bash
# ============================================================
# Auto-deploy backend: pull git, rebuild Docker khi có commit mới.
# Chạy định kỳ bằng cron (xem SETUP.md).
#   - Không có thay đổi  -> không làm gì.
#   - Có commit mới      -> reset về origin/main + docker compose up -d --build.
# ============================================================
set -euo pipefail

# Thư mục repo = thư mục cha của script này
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BRANCH="${DEPLOY_BRANCH:-main}"

git fetch --quiet origin "$BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "$(date '+%F %T') | up-to-date ($LOCAL)"
  exit 0
fi

echo "$(date '+%F %T') | deploying $LOCAL -> $REMOTE"
git reset --hard "origin/$BRANCH"

# COMPOSE_PROFILES (vd: tunnel) được đọc tự động từ .env
docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true

echo "$(date '+%F %T') | done"
