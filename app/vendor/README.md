# CRM TechFala (vendor)

Código do CRM: [eduardolimasanjaworks/crm-techfala](https://github.com/eduardolimasanjaworks/crm-techfala)

Path: `app/vendor/crm-techfala`

## Atualizar (merge sob demanda)

```bash
# Minas (submodule)
cd ferramenta-minasplaca
git submodule update --remote app/vendor/crm-techfala
git add app/vendor/crm-techfala .gitmodules
git commit -m "chore: bump crm-techfala"

# Tilit (clone aninhado — mesmo path)
cd ferramenta-tilit/app/vendor/crm-techfala
git fetch origin && git checkout main && git pull --ff-only origin main
cd ../../..
# rebuild
docker compose up -d --build app
```

O Docker build compila o CRM e publica em `/crm/` (iframe da aba CRM no painel).
