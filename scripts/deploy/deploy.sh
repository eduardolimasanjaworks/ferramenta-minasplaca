#!/bin/bash
# Por que existe: executa o deploy da ferramenta MinasPlaca neste servidor.
# Avanca o git (somente fast-forward, nunca sobrescreve trabalho local),
# reconstroi o container "app" via docker compose e confirma que o /health
# voltou saudavel. Chamado pelo verificar-remotos.sh ou manualmente.

set -euo pipefail

DIR_PROJETO="/root/minasplaca-rag/ferramenta-minasplaca"
URL_HEALTH="http://127.0.0.1:8095/health"
COMMIT_ALVO="${1:?uso: deploy.sh <sha-do-commit>}"

cd "$DIR_PROJETO"

echo "[deploy] $(date '+%F %T') iniciando deploy para o commit ${COMMIT_ALVO:0:7}"

# --ff-only: se houver conflito com arquivos editados direto no servidor,
# o git recusa e o deploy para aqui sem quebrar nada.
git merge --ff-only "$COMMIT_ALVO"

docker compose build app
docker compose up -d app

# Aguarda ate 60s o app subir e responder saudavel.
for _ in $(seq 1 12); do
  sleep 5
  if curl -fsS -m 5 "$URL_HEALTH" >/dev/null 2>&1; then
    echo "[deploy] sucesso: app saudavel no commit $(git rev-parse --short HEAD)"
    exit 0
  fi
done

echo "[deploy] ERRO: app nao respondeu no $URL_HEALTH apos o deploy" >&2
exit 1
