# 05 — Negociação de frete (piso, teto, escalonamento)

## Objetivo

Dentro dos limites comerciais da oferta, tentar fechar. Se não der, **passar para a equipe** — não ficar em loop infinito.

## Pré-requisito

Última mensagem GMX no histórico contém oferta com **origem, destino e valor** (Cenário 9).

## Parâmetros (exemplo — valores vêm do ERP)

| Campo | Regra |
|-------|--------|
| VALOR_OFERTA | Extraído da mensagem GMX (ex.: 4500) |
| VALOR_MINIMO | `config_rotas.valor_minimo` ou `embarques.valor_minimo` (match origem/destino) |
| VALOR_MAXIMO | `config_rotas.valor_maximo` ou `embarques.valor_maximo` |
| Rodadas máximas | 3 contrapropostas do motorista |

**Não usar 90% do ofertado** — isso é política de **pagamento** (adiantamento), não faixa de negociação. Ver `07-negociacao-portal-rotas.md`.

Se não houver rota configurada no ERP → **escalonar** (`escalonar_negociacao`), não inventar piso/teto.

---

## Fluxo padrão — aceita valor ofertado

```
GMX: ... valor R$ 4.500,00 ...
Motorista: fechado nesse valor
GMX: Show de bola, já anotei, a equipe te chama, boa viagem
```

```json
{
  "ferramenta": "resposta_oferta_carga",
  "dados": {
    "aceite": true,
    "valor_aceito": 4500,
    "valor_ofertado": 4500,
    "origem": "Guarulhos SP",
    "destino": "Curitiba PR"
  }
}
```

---

## Fluxo padrão — contraproposta dentro da faixa ERP

```
Motorista: só faço por 4.800
GMX: O máximo pra essa rota é R$ 4.800 parceiro, topa nesse valor?
```

(Se `valor_maximo` no ERP for 4.800; se for 4.500, o teto é 4.500.)

Se motorista aceita no teto do ERP:

```json
{ "aceite": true, "valor_aceito": 4800, "valor_ofertado": 4500, "valor_minimo": 4050, "valor_maximo": 4800 }
```

Se motorista propõe **acima do `valor_maximo` do ERP** → não aceitar no JSON; escalar ou contrapropor no teto.

---

## Fluxo padrão — abaixo do piso

```
Motorista: faço por 3.000
GMX: O piso pra essa carga é R$ 4.050 parceiro, consegue chegar perto disso?
```

Não aceitar no JSON abaixo de VALOR_MINIMO.

---

## Fluxo padrão — escalonamento para equipe

**Gatilho (qualquer um):**

- 3 rodadas sem acordo
- Motorista exige valor **acima do teto** e não cede
- Motorista pede condição fora de escopo (adiantamento diferente, troca de origem, etc.)
- Motorista aceita “com ressalva” que IA não pode confirmar

```
GMX: Entendi parceiro, vou passar pra equipe dar uma olhada nesse valor e te retornam, aguarda um pouco
```

**Sistema (🔧 expectativa):**

```json
{
  "ferramenta": "escalonar_equipe",
  "dados": {
    "motivo": "negociacao_sem_acordo",
    "valor_pedido_motorista": 5000,
    "valor_ofertado": 4500,
    "valor_minimo": 4050,
    "rodadas": 3,
    "origem": "Guarulhos SP",
    "destino": "Curitiba PR"
  }
}
```

- Pausar IA automática nesse contato (`ia_controle` / pausa por contato)
- Notificar operador no Chatwoot/Directus

**IA para de negociar** até humano retomar ou liberar.

---

## Variações

### V1 — Contraproposta aceitável no meio

```
Motorista: 4.200 topa?
GMX: Fechado parceiro em R$ 4.200, boa viagem
```

```json
{ "aceite": true, "valor_aceito": 4200, "valor_ofertado": 4500 }
```

(só se 4200 ≥ VALOR_MINIMO)

### V2 — Motorista recusa após negociar

```
Motorista: então não rola
GMX: Combinado, fica pra próxima parceiro, boa viagem
```

```json
{ "aceite": false, "valor_ofertado": 4500 }
```

### V3 — “Manda o contrato” / dúvida jurídica

Escalonar equipe — fora do escopo da IA.

### V4 — Negocia diária / pedágio

```
Motorista: e as diárias?
GMX: Sobre diária a equipe te confirma na hora do fechamento parceiro, o frete da oferta é R$ 4.500
```

Política comercial define se isso é escalonamento imediato.

---

## O que NÃO fazer

- Aceitar valor acima do teto sem escalonar
- Mais de 3 rodadas de ida-e-volta de preço
- Inventar origem/destino/valor
- Dizer “fechado” sem `resposta_oferta_carga`

## Pergunta para alinhar com você

1. Teto é **sempre** o valor da mensagem ou existe margem no ERP não mostrada ao motorista?
2. Escalonamento vai para **fila Chatwoot**, **tarefa Directus** ou **só pausa IA**?
