# 04 — Oferta de carga (motorista selecionado)

## Objetivo

Conduzir oferta de frete até **aceite**, **recusa** ou **negociação** (doc 05).

Duas partes:

1. **🔧 Disparo** — operação/ERP escolhe motorista e inicia conversa
2. **IA** — conduz resposta do motorista até fechar

---

## Parte A — Disparo proativo (expectativa operacional)

**Quem inicia:** equipe, automação Directus ou job iagmx — **não o LLM sozinho**.

```
GMX → motorista selecionado:
Temos uma carga — retirada Guarulhos SP, entrega Curitiba PR, valor R$ 4.500,00 —
você está por onde e tem interesse?
```

Dados mínimos na mensagem:

- Origem (retirada)
- Destino (entrega)
- Valor em reais
- Pergunta de localização + interesse

**Sistema (🔧 ao disparar):** registrar oferta aberta no ERP (`match_id`, telefone, valor, origem, destino) para a IA usar depois.

---

## Parte B — IA conduz (Fase A: local + interesse)

### Fluxo padrão — aceite direto

```
GMX: [mensagem oferta acima]
Motorista: to em Guarulhos, topo sim
GMX: Show de bola, já anotei, a equipe te chama, boa viagem
```

```json
{
  "ferramenta": "registrar_disponibilidade",
  "dados": {
    "disponivel": true,
    "localizacao_atual": "Guarulhos SP"
  }
}
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

Ordem: pode combinar disponibilidade + oferta no mesmo turno se motorista deu tudo.

### Fluxo padrão — falta localização

```
Motorista: topo sim
GMX: Show, me diz cidade e estado onde você tá
```

Não fechar oferta sem local válida.

### Fluxo padrão — falta interesse

```
Motorista: to em Campinas
GMX: E topa essa carga no valor de R$ 4.500?
```

### Fluxo padrão — recusa

```
Motorista: não rola / to longe
GMX: Combinado, fica para a próxima, boa viagem
```

```json
{
  "ferramenta": "resposta_oferta_carga",
  "dados": {
    "aceite": false,
    "valor_ofertado": 4500,
    "origem": "Guarulhos SP",
    "destino": "Curitiba PR"
  }
}
```

---

## Variações

### V1 — Só pergunta valor sem contexto de oferta

```
Motorista: quanto paga?
GMX: O valor depende da carga parceiro, quando tiver oferta a gente te passa
```

Sem Cenário 9 sem oferta no histórico.

### V2 — Interesse com ressalva

```
Motorista: interesse mas só se for amanhã
GMX: Anotei o interesse parceiro, a equipe confirma o embarque e te chama
```

Registrar aceite condicionado em `observacao` + **🔧 escalonar** se política exigir humano.

### V3 — Motorista some após oferta

Sem resposta em X horas: **🔧** não insistir em loop; equipe ou retry único depois de 24h (política comercial).

### V4 — Oferta para vários motoristas

Cada conversa é independente; primeiro a aceitar não cancela os outros automaticamente (**regra ERP**).

### V5 — Motorista já carregado recebe oferta

```
Motorista: to carregado ainda
GMX: Entendido parceiro, anotei, quando liberar a gente vê essa ou outra
```

Não forçar aceite; opcional registrar recusa ou “interesse futuro”.

---

## O que NÃO fazer

- Inventar origem/destino/valor que não estão na mensagem GMX
- Aceitar oferta sem `resposta_oferta_carga` no aceite/recusa
- Pular localização quando motorista só disse “topo”

## Critério de sucesso

| Momento | ERP |
|---------|-----|
| Local informada | `disponivel` atualizado |
| Aceite/recusa | `historico_ofertas` |
| Negociação | doc 05 |
