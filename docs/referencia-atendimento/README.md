# Referência de atendimento — IA GMX

Documentos de **expectativa operacional**: como a IA deve conduzir cada situação, com variações comuns. Serve para validar se produto, prompt e código estão alinhados.

**Não é prompt literal** — é o “manual do que certo parece” antes de implementar.

## Princípios gerais (todas as situações)

| Regra | Comportamento |
|-------|----------------|
| Formato WhatsApp | Uma linha, vírgulas (máx. 3), sem ponto final, tom parceiro |
| Uma pergunta por vez | Não empilhar cidade + data + interesse na mesma mensagem quando o fluxo exige parada |
| Ferramentas | Persistência no Directus via tool/API — nunca só “fingir” que salvou |
| Proatividade GMX | A IA **não inventa** oferta ou mensagem da empresa; só continua o que já está no histórico |
| Silêncio | Após despedida da GMX + “valeu”/“ok” do motorista → **não responder** |
| Escalonar humano | Quando regra de negócio esgotar (negociação, dúvida fora do escopo, documento ilegível após 2 tentativas) |

## Situações cobertas

| Doc | Situação |
|-----|----------|
| [01-localizacao.md](./01-localizacao.md) | Onde o motorista está (cidade ou GPS) |
| [02-disponibilidade-vazio-carregado.md](./02-disponibilidade-vazio-carregado.md) | Vazio vs carregado + confirmação proativa |
| [03-agenda-quando-libera.md](./03-agenda-quando-libera.md) | Carregado → data de liberação / agenda |
| [04-oferta-carga.md](./04-oferta-carga.md) | Oferta proativa a motorista selecionado |
| [05-negociacao-frete.md](./05-negociacao-frete.md) | Piso, teto, recusa, escalonamento |
| [06-cadastro-documentos.md](./06-cadastro-documentos.md) | Coleta de docs + OCR (imagem/PDF) |
| [07-negociacao-portal-rotas.md](./07-negociacao-portal-rotas.md) | Rotas no portal, piso/teto, escalonamento, tom |

## Canais de entrada

| Canal | Entrada | Saída (expectativa) |
|-------|---------|---------------------|
| Evolution (QR / whatsapp.html) | Texto, áudio, imagem, PDF, pin GPS | Resposta pela Evolution |
| Chatwoot | Webhook `message_created` (texto; **futuro**: anexos) | Resposta pela Evolution |

## O que ainda é “expectativa futura” vs hoje

Marcado com **🔧 sistema** nos docs:

- Disparo proativo de oferta (ERP escolhe motorista → iagmx envia)
- Cron que recontata na `data_previsao_disponibilidade`
- Escalonamento automático para fila humana
- Anexos Chatwoot no pipeline OCR/GPS
- Reverse geocoding (GPS → cidade)

Conversamos esses gaps na revisão técnica; os fluxos abaixo descrevem o **alvo**.

## Como usar estes docs

1. Leia o fluxo **padrão** de cada situação.
2. Confira as **variações** — são os casos que mais quebram em produção.
3. Marque ✅ / ❌ / ⚠️ se cada bloco reflete o que você quer.
4. Ajustes viram mudança de prompt, ferramenta ou código — nesta ordem.

## Plano de implementação (disparo de ofertas)

Fluxo ERP → kanban → iagmx documentado em:

- **[plano-disparo-ofertas-gmx.md](../plano-disparo-ofertas-gmx.md)** — 6 fases lineares (F1 modelo Directus … F6 validação E2E).
- **[plano-evolucao-ia-gmx.md](../plano-evolucao-ia-gmx.md)** — plano mestre (inteligência + produto + guardrails).
