# Debug Session: oferta-aumento-pausa
- **Status**: [OPEN]
- **Issue**: na oferta proativa, a mensagem `o quanto voce pode aumentar pra mim?` cai em resposta vaga e pausa humana, em vez de consultar a faixa negociavel e responder objetivamente
- **Debug Server**: pending
- **Log File**: .dbg/trae-debug-log-oferta-aumento-pausa.ndjson

## Hypotheses
1. A pergunta de aumento nao e reconhecida pelo motor de negociacao C9 e cai no LLM.
2. A faixa negociavel da rota nao chega ao fluxo, entao a IA nao sabe o maximo permitido.
3. A oferta ativa no historico nao preserva contexto suficiente para consultar a rota/valor.
4. O fallback do LLM gera texto considerado vago e aciona pausa humana.
5. O bug e correlato ao outro caso porque ambos escapam do fluxo programatico antes da resposta final.

## Evidence Plan
- Reproduzir o caso com historico de oferta real e mensagem de pedido de aumento
- Inspecionar logs e saidas do fluxo de negociacao
- Verificar se ha faixa negociavel calculada para a rota no contexto atual
- Confirmar se o fallback do LLM esta sendo atingido antes do handoff

## Notes
- Nenhuma logica de negocio alterada ate coletar evidencia suficiente.
