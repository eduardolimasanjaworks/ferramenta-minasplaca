#!/bin/bash
# Bateria de saúde — Minas Placa (iaminas)
set -uo pipefail

BASE="${BASE_URL:-http://127.0.0.1:8095}"
EXT="${EXT_URL:-https://iaminas.sanjaworks.com}"
EMAIL="${ADMIN_EMAIL:-admin@minasplaca.com}"
SENHA="${ADMIN_SENHA:-MinasPlaca2026!}"
COOKIE_JAR=$(mktemp)
PASS=0
FAIL=0
WARN=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠ $1"; WARN=$((WARN+1)); }
section() { echo ""; echo "=== $1 ==="; }

section "1. Containers Docker"
for svc in minasplaca_app minasplaca_postgres minasplaca_redis; do
  docker ps --format '{{.Names}}' | grep -qx "$svc" && ok "$svc rodando" || fail "$svc ausente"
done
docker inspect minasplaca_postgres --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy && ok "Postgres healthy" || fail "Postgres unhealthy"
docker inspect minasplaca_redis --format '{{.State.Health.Status}}' 2>/dev/null | grep -q healthy && ok "Redis healthy" || fail "Redis unhealthy"

section "2. Health (local + externo)"
for url in "$BASE/health" "$EXT/health"; do
  body=$(curl -sS --max-time 15 "$url" 2>/dev/null) || { fail "GET $url"; continue; }
  echo "$body" | python3 -c "import sys,json;d=json.load(sys.stdin);s=d['servicos'];assert s['redis'] and s['postgres']" 2>/dev/null \
    && ok "$url → $(echo "$body" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['status'])")" \
    || fail "$url resposta inválida"
done

section "3. Login e painel"
code=$(curl -sS -o /dev/null -w "%{http_code}" -c "$COOKIE_JAR" -X POST "$BASE/login" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"senha\":\"$SENHA\"}")
[ "$code" = "200" ] && ok "POST /login" || fail "POST /login → $code"
code=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE/phone.html")
[ "$code" = "200" ] && ok "GET /phone.html" || fail "GET /phone.html → $code"

section "4. APIs autenticadas"
for path in /api/auth/perfil /api/ia/pausa-global /api/ia/pausas-ativas \
  "/api/ia/conversas-iniciadas?dias=90" /api/ia/precos /api/ia/proativos \
  "/api/ia/proativos/logs?limite=10" /api/ia/followup /api/whatsapp/status /api/whatsapp/info; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE$path" 2>/dev/null)
  [ "$code" = "200" ] && ok "GET $path" || fail "GET $path → $code"
done

section "5. Postgres"
counts=$(docker exec minasplaca_postgres psql -U minasplaca -d minasplaca -t -A -c "
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (
  'precos_faixa','precos_extra','log_pausa','historico_conversa','proativos_disparos_log'
);" 2>/dev/null | wc -l)
[ "$counts" -ge 5 ] && ok "Tabelas críticas presentes ($counts)" || fail "Tabelas críticas ausentes"

section "6. phone.html + TypeScript"
node -e "const fs=require('fs');const h=fs.readFileSync('/root/minasplaca-rag/ferramenta-minasplaca/app/public/phone.html','utf8');new Function(h.match(/<script>([\\s\\S]*?)<\\/script>/)[1]);" 2>/dev/null \
  && ok "JS do painel válido" || fail "JS do painel inválido"
(cd /root/minasplaca-rag/ferramenta-minasplaca/app && node ./node_modules/typescript/bin/tsc --noEmit 2>/dev/null) \
  && ok "tsc --noEmit" || fail "tsc com erros"

section "7. Calculadora (no container)"
out=$(docker exec minasplaca_app node --input-type=module -e "
import { calcularOrcamento } from './dist/calculadora-minasplaca.js';
const r = await calcularOrcamento({ material: 'poliester', largura: 30, comprimento: 15, quantidade: 100 });
if (!r?.total) process.exit(1);
console.log(r.total.toFixed(2));
" 2>&1)
echo "$out" | grep -qE '^[0-9]+\.[0-9]+$' && ok "calcularOrcamento → R$ $out" || warn "Calculadora: $out"

section "8. Integrações"
curl -sS -b "$COOKIE_JAR" "$BASE/api/whatsapp/status" | python3 -c "import sys,json;d=json.load(sys.stdin);exit(0 if d.get('connected') else 1)" 2>/dev/null \
  && ok "WhatsApp conectado" || warn "WhatsApp desconectado"
curl -sS -b "$COOKIE_JAR" "$BASE/api/chatwoot/sso" | python3 -c "import sys,json;d=json.load(sys.stdin);exit(0 if d.get('iframeUrl') else 1)" 2>/dev/null \
  && ok "Chatwoot SSO" || warn "Chatwoot SSO indisponível"
code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BASE/webhook/chatwoot?key=minasplaca-pausa-2026" \
  -H 'Content-Type: application/json' -d '{}')
[ "$code" != "401" ] && ok "Webhook Chatwoot autenticado (HTTP $code)" || fail "Webhook sem auth"

section "9. Logs do app"
docker logs minasplaca_app --since 30m 2>&1 | rg -qi "fatal|Falha fatal" \
  && warn "Erros fatais nos logs (30 min)" || ok "Sem erros fatais (30 min)"

rm -f "$COOKIE_JAR"
section "RESUMO"
echo "  Passou: $PASS | Falhou: $FAIL | Avisos: $WARN"
[ "$FAIL" -eq 0 ] && echo "RESULTADO: SAUDÁVEL" && exit 0
echo "RESULTADO: PROBLEMAS DETECTADOS" && exit 1
