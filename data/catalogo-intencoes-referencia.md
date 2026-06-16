# Catálogo de intenções — referencia-atendimento

Gerado em 2026-06-15T15:14:21.360Z

| Doc | Intenção | Exemplos |
|-----|----------|----------|
| 01-localizacao.md | localizacao | 9 |
| 02-disponibilidade-vazio-carregado.md | disponibilidade | 10 |
| 03-agenda-quando-libera.md | agenda_liberacao | 4 |
| 04-oferta-carga.md | oferta | 7 |
| 05-negociacao-frete.md | negociacao | 7 |
| 06-cadastro-documentos.md | cadastro | 9 |
| 07-negociacao-portal-rotas.md | negociacao | 3 |

## Amostra por intenção

### localizacao
- "pode sim" → `interpretar_contexto`
- "vazio" → `interpretar_contexto`
- "Campinas SP" → `interpretar_contexto`
- "[anexo mídia]" → `registrar_disponibilidade`
- "tô perto do posto na rodovia" → `interpretar_contexto`
- "sim" → `perguntar`
- "tô em Campinas" → `interpretar_contexto`
- "[pin] e tô em Sumaré" → `interpretar_contexto`

### disponibilidade
- "ok / pode / manda" → `interpretar_contexto`
- "vazio / to livre / disponível" → `registrar_disponibilidade`
- "carregado / em viagem / to cheio" → `registrar_disponibilidade`
- "Rio de Janeiro RJ" → `registrar_disponibilidade`
- "libero sexta-feira" → `registrar_disponibilidade`
- "mais ou menos / depende" → `interpretar_contexto`
- "vazio, queria algo pro sul" → `registrar_disponibilidade`
- "logo / não sei" → `registrar_disponibilidade`

### agenda_liberacao
- "dia 20/06 / sexta / libero amanhã" → `interpretar_contexto`
- "libero sexta às 14h" → `interpretar_contexto`
- "to indo pro RJ" → `interpretar_contexto`
- "na verdade só libero segunda" → `interpretar_contexto`

### oferta
- "to em Guarulhos, topo sim" → `oferta`
- "topo sim" → `registrar_disponibilidade`
- "to em Campinas" → `interpretar_contexto`
- "não rola / to longe" → `interpretar_contexto`
- "quanto paga?" → `perguntar`
- "interesse mas só se for amanhã" → `interpretar_contexto`
- "to carregado ainda" → `registrar_disponibilidade`

### negociacao
- "fechado nesse valor" → `oferta`
- "só faço por 4.800" → `interpretar_contexto`
- "4.800 é o mínimo" → `oferta`
- "faço por 3.000" → `interpretar_contexto`
- "4.200 topa?" → `interpretar_contexto`
- "então não rola" → `interpretar_contexto`
- "e as diárias?" → `interpretar_contexto`
- "só faço por 5.000" → `interpretar_contexto`

### cadastro
- "quero me cadastrar" → `interpretar_contexto`
- "[foto CNH]" → `pedir_documento`
- "[PDF ANTT]" → `interpretar_contexto`
- "12345678900" → `pedir_documento`
- "[foto caminhão]" → `pedir_documento`
- "[foto comprovante de luz]" → `pedir_documento`
- "[CNH] [CRLV] [ANTT]" → `interpretar_contexto`
- "[áudio: "tô sem CNH física"]" → `pedir_documento`

