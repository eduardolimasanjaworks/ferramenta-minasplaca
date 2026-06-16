#!/bin/bash
# Bootstrap da instância Evolution API para IA GMX
set -euo pipefail

EVO_URL="${EVO_URL:-http://127.0.0.1:8094}"
API_KEY="${API_KEY:-iagmx-evolution-key-2026}"
INSTANCE="${INSTANCE:-gmx-atendimento}"
WEBHOOK_URL="${WEBHOOK_URL:-https://iagmx.sanjaworks.com/webhook/evolution}"

echo "==> Criando instância ${INSTANCE}..."
curl -sS -X POST "${EVO_URL}/instance/create" \
  -H "apikey: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"instanceName\":\"${INSTANCE}\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":true}" \
  | head -c 500
echo ""

echo "==> Configurando webhook..."
curl -sS -X POST "${EVO_URL}/webhook/set/${INSTANCE}" \
  -H "apikey: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"webhook\": {
      \"enabled\": true,
      \"url\": \"${WEBHOOK_URL}\",
      \"webhookByEvents\": false,
      \"webhookBase64\": false,
      \"events\": [\"MESSAGES_UPSERT\", \"CONNECTION_UPDATE\", \"QRCODE_UPDATED\"]
    }
  }" \
  | head -c 500
echo ""

echo "==> Conectando WhatsApp (QR code)..."
curl -sS "${EVO_URL}/instance/connect/${INSTANCE}" \
  -H "apikey: ${API_KEY}" \
  | head -c 500
echo ""

echo ""
echo "==> Pronto! Acesse https://iagmx.sanjaworks.com/evo/ para escanear o QR code."
echo "    Ou use: curl -s ${EVO_URL}/instance/connect/${INSTANCE} -H 'apikey: ${API_KEY}'"
