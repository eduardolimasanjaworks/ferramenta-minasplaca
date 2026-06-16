# Plano linear — Disparo de ofertas GMX + iagmx

**Data:** 2026-06-15  
**Status:** F1 ✅ | F2 ✅ | F3 ✅ (import kanban) | F4–F6 pendentes  
**Plano IA (inteligência + ordem de execução):** [plano-evolucao-ia-gmx.md](./plano-evolucao-ia-gmx.md)  
**Regra absoluta:** a IA **nunca** inventa carga. Toda oferta nasce no ERP (cadastro ou CSV) e só é enviada após ação humana explícita.

---

## 1. Situação atual (inventário)

| Peça | Repo | Estado |
|------|------|--------|
| Import CSV | gmx → `follow` | ✅ `CsvImportDialog` + `ShipmentFollow` |
| Kanban embarques | gmx → `embarques` | ✅ `ShipmentBoard` |
| Rotas min/máx + operação | gmx → Directus | ✅ UI `ConfigIAPanel` (script pode não ter rodado em prod) |
| Matching score | gmx | ⚠️ `matchingAlgorithm` + `MatchingPanel` (botão = TODO) |
| Auto-disparo n8n | gmx | ⚠️ `notificationService` / `autoMatching` — **sem aprovação** |
| Buscar rota no prompt | iagmx | ✅ `rotas-gmx.ts` + injeção no `contexto-inferencia` |
| Ferramentas oferta/negociação | iagmx | ✅ `resposta_oferta_carga`, `escalonar_negociacao` |
| Endpoint disparo | iagmx | ✅ `POST /api/disparar-oferta` |
| Correlação rota pós-import | gmx | ✅ `correlacionarRota.ts` + `embarque-rota-service.ts` + dialog |
| Auditoria escolha de rota | gmx | ✅ coleção `embarque_rota_log` + writes no service |

**Problema central:** `follow` (CSV) e `embarques` (kanban) são coleções separadas, sem vínculo com `config_rotas`.

---

## 2. Fluxo alvo (definitivo)

```
[Operador] CSV ou cadastro manual
    → registros em embarques (status: new)
    → correlacionarRota(origem, destino, operação?)
        ├─ match  → grava config_rota_id + valor_min/max + operação
        └─ sem match → status rota_pendente + modal (criar rota | associar existente) + log auditoria
    → rankMotoristas(embarque): filtra por operação + proximidade (último disponivel)
    → card kanban: operador vê sugestão e clica [Autorizar disparo WhatsApp]
    → GMX chama iagmx POST /api/disparar-oferta
    → iagmx envia mensagem fixa via Evolution (texto montado pelo ERP, não pelo LLM)
    → motorista responde → iagmx conduz (negociação dentro de config_rotas)
```

---

## 3. Fases (linear, finitas — 6 fases)

Cada fase tem **entrada**, **entrega** e **critério de saída**. Não avançar sem saída cumprida.

### Fase 1 — Modelo de dados Directus
**Repo:** gmx  
**Entrada:** coleções `config_rotas`, `embarques` existentes  

**Entrega:**
- Campos em `embarques`:
  - `config_rota_id` (FK opcional)
  - `rota_status` (`correlacionada` | `pendente` | `manual`)
  - `operacao` (string, denormalizado da rota)
  - `valor_ofertado` (decimal — valor anunciado na mensagem)
  - `valor_minimo` / `valor_maximo` (copiados da rota no match)
  - `follow_id` (opcional — vínculo se veio do follow)
- Coleção `embarque_rota_log`:
  - `embarque_id`, `acao`, `config_rota_id_antes`, `config_rota_id_depois`, `usuario`, `detalhes` (JSON), `date_created`
- Script `scripts/setup-embarque-rota-directus.js`

**Saída:** script executável; campos visíveis no Directus. ✅ Executado em prod 2026-06-15.

---

### Fase 2 — Correlacionar rota (biblioteca + pós-import)
**Repo:** gmx  
**Entrada:** Fase 1 concluída  

**Entrega:**
- `src/lib/correlacionarRota.ts` — mesma lógica de match flexível do iagmx (`origem`/`destino`/`operacao`)
- `CorrelacionarRotaDialog.tsx` — lista embarques `rota_pendente`, permite associar ou criar rota
- Hook pós-import CSV: cada linha → cria `embarque` + tenta correlacionar
- Registro em `embarque_rota_log` em toda ação

**Saída:** importar CSV gera embarques com rota correlacionada ou fila de pendências resolvível na UI. ✅ 2026-06-15

---

### Fase 3 — CSV na aba Embarques
**Repo:** gmx  
**Entrada:** Fase 2 concluída  

**Entrega:**
- Botão **Importar CSV** em `ShipmentBoard` (reutiliza `CsvImportDialog` com modo `embarques`)
- Follow mantém import atual (sem remover)
- Fluxo opcional: botão "Promover para embarque" em linha do Follow

**Saída:** operador importa na aba que usa no dia a dia (Embarques), sem depender só do Follow. ✅ 2026-06-15

---

### Fase 4 — Matching + aprovação no kanban
**Repo:** gmx  
**Entrada:** Fases 1–2 (embarque com rota e operação)  

**Entrega:**
- `rankMotoristasParaEmbarque(embarque_id)`:
  - filtra motoristas compatíveis com `operacao` / tipo veículo
  - ordena por `disponivel.date_created` DESC + score localização (cidade; lat/lng se houver)
- Painel no card/detalhe do embarque (status `new` ou `needs_attention`):
  - top 3 motoristas + justificativa
  - botão **[Autorizar disparo WhatsApp]** (um motorista por vez)
- Desativar caminho `autoMatching` → n8n sem clique humano (flag ou remoção do cron)

**Saída:** nenhuma mensagem WhatsApp sai sem clique do operador no card.

---

### Fase 5 — API disparo iagmx + integração GMX
**Repo:** iagmx + gmx  
**Entrada:** Fase 4 concluída  

**Entrega iagmx:**
- `POST /api/disparar-oferta` (protegido `IAGMX_ADMIN_KEY`)
  - body: `{ telefone, embarque_id, origem, destino, valor_ofertado, valor_minimo, valor_maximo, operacao, match_id? }`
  - monta texto **fixo** (template ERP, não LLM)
  - envia via Evolution
  - grava `historico_ofertas` (tipo `oferta_enviada`)
  - opcional: seed primeira mensagem `assistant` no histórico Redis para a IA continuar

**Entrega gmx:**
- `dispararOfertaIagmx(embarque, motorista)` chama o endpoint após aprovação
- atualiza embarque: `status → sent`, `driver_id`, timestamp

**Saída:** teste manual — um disparo real no WhatsApp de teste; IA responde na sequência.

---

### Fase 6 — Validação E2E e documentação
**Repo:** ambos  
**Entrada:** Fase 5 concluída  

**Entrega:**
- Script `gmx/scripts/teste-fluxo-disparo.mjs` (ou iagmx): CSV fake → correlacionar → aprovar → disparar → simular resposta
- Atualizar `docs/referencia-atendimento/04-oferta-carga.md` com fluxo definitivo
- Checklist operacional para produção (rodar scripts Directus, env vars)

**Saída:** relatório pass/fail; deploy documentado.

---

## 4. Fora de escopo deste plano

- Geocoding reverso (GPS → cidade) — usar lat/lng direto no ERP
- Job de proximidade em background separado da IA
- Anexos Chatwoot no pipeline
- IA escolher motorista ou montar texto da oferta
- Migrar histórico follow → embarques em massa (só botão pontual)

---

## 5. Dependências e ordem (não pular)

```
F1 → F2 → F3
F2 → F4 → F5 → F6
(F3 paralelo a F4 após F2, mas F4 não depende de F3)
```

Ordem de execução recomendada: **F1 → F2 → F3 → F4 → F5 → F6**

---

## 6. Riscos conhecidos

| Risco | Mitigação |
|-------|-----------|
| Script Directus não rodado em prod | F1 inclui checklist + idempotente |
| `embarques` schema diferente do esperado | F1 inspeciona campos existentes antes de criar |
| Container iagmx desatualizado | F5 inclui passo deploy + health |
| n8n ainda disparando em paralelo | F4 desliga autoMatching |

---

## 7. Estimativa de esforço (ordem de grandeza)

| Fase | Esforço |
|------|---------|
| F1 | 0,5–1 dia |
| F2 | 1–1,5 dia |
| F3 | 0,5 dia |
| F4 | 1,5–2 dias |
| F5 | 1 dia |
| F6 | 0,5 dia |
| **Total** | **~5–7 dias** focados |

---

## 8. Critério de “pronto para produção”

1. CSV na aba Embarques cria cargas com rota correlacionada ou pendência auditável  
2. Operador aprova disparo no kanban — único caminho de envio  
3. Mensagem WhatsApp contém origem, destino, valor real do embarque  
4. iagmx negocia só dentro de min/máx da rota vinculada  
5. IA nunca inicia oferta sozinha  
