#!/bin/bash
# Por que existe: deploy automatico sem SSH e sem GitHub Actions (nao temos
# admin em todos os repositorios para registrar runners). Um timer systemd
# roda este script a cada minuto: ele busca a main dos 3 remotos e, se algum
# estiver a frente do servidor, chama o deploy.sh. Merge aprovado = producao.

set -uo pipefail

DIR_PROJETO="/root/minasplaca-rag/ferramenta-minasplaca"
REMOTOS=("origin" "oficial" "old")
BRANCH="main"
ARQ_LOCK="/var/lock/minasplaca-autodeploy.lock"
DIR_ESTADO="/var/lib/minasplaca-autodeploy"

mkdir -p "$DIR_ESTADO"

# Impede duas execucoes simultaneas (o build demora mais que 1 minuto).
exec 9>"$ARQ_LOCK"
flock -n 9 || exit 0

cd "$DIR_PROJETO"

for REMOTO in "${REMOTOS[@]}"; do
  if ! git fetch --quiet "$REMOTO" "$BRANCH" 2>/dev/null; then
    echo "[verificar] aviso: falha ao buscar $REMOTO/$BRANCH" >&2
    continue
  fi

  SHA_REMOTO=$(git rev-parse FETCH_HEAD)
  SHA_LOCAL=$(git rev-parse HEAD)

  [ "$SHA_REMOTO" = "$SHA_LOCAL" ] && continue

  if git merge-base --is-ancestor "$SHA_LOCAL" "$SHA_REMOTO"; then
    echo "[verificar] $(date '+%F %T') commit novo em $REMOTO/$BRANCH: ${SHA_LOCAL:0:7} -> ${SHA_REMOTO:0:7}"
    if "$DIR_PROJETO/scripts/deploy/deploy.sh" "$SHA_REMOTO"; then
      echo "[verificar] deploy vindo de $REMOTO concluido"
    else
      echo "[verificar] ERRO no deploy vindo de $REMOTO (detalhes acima)" >&2
    fi
  elif git merge-base --is-ancestor "$SHA_REMOTO" "$SHA_LOCAL"; then
    : # remoto esta atras do servidor; nada a fazer
  else
    # Avisa apenas uma vez por commit divergente para nao poluir o journal.
    ARQ_AVISO="$DIR_ESTADO/divergencia-$REMOTO"
    if [ "$(cat "$ARQ_AVISO" 2>/dev/null)" != "$SHA_REMOTO" ]; then
      echo "[verificar] AVISO: $REMOTO/$BRANCH divergiu do servidor; resolucao manual necessaria (nada sera sobrescrito)" >&2
      echo "$SHA_REMOTO" > "$ARQ_AVISO"
    fi
  fi
done
