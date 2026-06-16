# 07 — Negociação, rotas no portal e escalonamento

**Decisões alinhadas com o produto (jun/2026)**

## Tom de voz

- Evitar repetir **"show parceiro"** em toda mensagem — soa robótico.
- Variar: "beleza", "fechou", "anotei", "combinado", "entendi", ou ir direto ao ponto.
- "Parceiro" no máximo **1x a cada 3–4 mensagens**, não em toda resposta.

## Valores de negociação — fonte da verdade

**Não calcular 90% no prompt.** Consultar o portal GMX (`/root/gmx` → Directus):

**Coleção `config_rotas`**

| Campo | Tipo |
|-------|------|
| `origem` | string |
| `destino` | string |
| `operacao` | FK → `tipos_operacao` (arroz, lata, ME, malte, + novos) |
| `valor_minimo` | decimal |
| `valor_maximo` | decimal |
| `ativo` | boolean |

**Coleção `tipos_operacao`** — lista editável no portal (CRUD).

A IA, ao negociar, deve:

1. Identificar **origem, destino e operação** da oferta no histórico (mensagem GMX + embarque/match se houver).
2. Buscar a **linha exata** em `config_rotas`.
3. Ofertar inicialmente o valor da mensagem GMX (≤ `valor_maximo`).
4. Se motorista contrapropõe: **subir gradualmente** dentro da faixa `[valor_minimo, valor_maximo]` — não pular direto pro teto.
5. Se esgotar faixa ou rodadas → **pausar IA** + **notificar telefones** cadastrados.

## Escalonamento

**Coleção `telefones_notificacao`**

| Campo | Tipo |
|-------|------|
| `nome` | string (rótulo, ex. "Adriano ops") |
| `telefone` | string E.164 |
| `ativo` | boolean |

Quando negociação estourar:

1. `pausarContato(motorista)` — IA para de responder.
2. Enviar aviso WhatsApp para cada telefone ativo (Evolution ou n8n).
3. Registrar em `historico_ofertas` com subtipo `escalonamento_negociacao`.

## Disponibilidade / agenda

- **Só registrar** `data_previsao_disponibilidade` no Directus (`disponivel`) — campo já existe no portal.
- **Não** enviar mensagem automática pelo iagmx nessa data.
- O **cron existente** no ecossistema GMX envia mensagens aos poucos para motoristas.
- **lat/lng basta** no ERP — sem obrigar cidade escrita; geocoding opcional no futuro.

## Proximidade motorista × carga (futuro)

- Comparar `latitude`/`longitude` do motorista (`disponivel`) com origem da carga.
- Ranquear motoristas mais pertos para o cron de ofertas.
- **Fora do escopo da IA conversando** — job separado no GMX.

## Fluxo de negociação (referência)

```
Oferta GMX: Guarulhos → Curitiba, arroz, R$ 4.500
[IA consulta config_rotas: min 4050, max 4800]

Motorista: só faço por 5.000
IA: O máximo pra essa rota é R$ 4.800, topa nesse valor?

Motorista: 4.650
IA: Fechado em R$ 4.650, já anotei, a equipe confirma, boa viagem
→ resposta_oferta_carga aceite=true valor_aceito=4650

Motorista: abaixo de 5.000 não rola de jeito nenhum
[após 3 rodadas ou recusa abaixo do mínimo]
IA: Vou passar pra equipe analisar esse valor, aguarda um retorno
→ pausa IA + notifica telefones_notificacao
```

## Portal — aba Config IA

Uma aba no dashboard com:

1. **Tipos de operação** (CRUD)
2. **Rotas** (origem | destino | operação | min | max)
3. **Telefones de notificação** (CRUD)

Permissão sugerida: `usuarios` ou admin.
