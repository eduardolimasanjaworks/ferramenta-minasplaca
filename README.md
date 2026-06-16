# IA de Atendimento GMX

Assistente virtual de atendimento via WhatsApp com Evolution API, OpenAI (gpt-4o + Whisper), debounce de mensagens e painel web para configurar o prompt.

## Requisitos

- Docker e Docker Compose
- Domínio `iagmx.sanjaworks.com` apontando para o servidor
- Token OpenAI válido no `.env`

## Configuração

O `.env` contém apenas uma variável:

```env
openaitoken=sk-proj-...
```

## Subir o stack

```bash
cd "/root/ia de atendimento gmx"
docker compose up -d --build
```

## Conectar WhatsApp

```bash
chmod +x scripts/bootstrap-evolution.sh
./scripts/bootstrap-evolution.sh
```

Acesse `https://iagmx.sanjaworks.com/evo/` para escanear o QR code.

## Painel web

Abra `https://iagmx.sanjaworks.com/` para editar o prompt do sistema.

## Endpoints

| Rota | Descrição |
|------|-----------|
| `/` | Painel de prompt |
| `/health` | Status dos serviços |
| `/api/prompt` | GET/PUT do prompt |
| `/webhook/evolution` | Webhook da Evolution |
| `/evo/` | Evolution API (proxy) |

## Arquitetura

- **Evolution API** — gateway WhatsApp (porta 8094)
- **App Fastify** — webhook, debounce, OpenAI, painel (porta 8095)
- **Postgres** — persistência do prompt
- **Redis** — debounce de mensagens (4s de silêncio)

## Modelos OpenAI

| Função | Modelo |
|--------|--------|
| Chat | gpt-4o |
| STT (áudio) | whisper-1 |
| OCR (imagem) | gpt-4o vision |

## Nginx + SSL

```bash
sudo cp nginx/iagmx.sanjaworks.com.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/iagmx.sanjaworks.com.conf /etc/nginx/sites-enabled/
sudo certbot certonly --webroot -w /var/www/certbot -d iagmx.sanjaworks.com
sudo nginx -t && sudo systemctl reload nginx
```
