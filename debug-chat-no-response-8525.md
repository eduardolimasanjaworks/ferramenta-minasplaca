# Debug Session: chat-no-response-8525
- **Status**: [OPEN]
- **Issue**: IA nao responde ao contato `5512997918525` e o monitor `/phone` nao reflete as mensagens inbound do usuario
- **Debug Server**: pending
- **Log File**: .dbg/trae-debug-log-chat-no-response-8525.ndjson

## Hypotheses
- O inbound do contato nao chega no webhook consumido pelo `iagmx-atendimento`.
- O inbound chega, mas e descartado antes de gravar historico/estado do monitor.
- O historico grava, mas o endpoint `/api/monitor/telefone` monta ou filtra errado este telefone.
- A IA processa o lote, mas o envio cai em fila, canal indisponivel ou instancia errada.

## Plan
- Coletar evidencia do estado do contato, do monitor e da trilha runtime atual.
- Instrumentar so os pontos minimos se os logs existentes nao bastarem.
- Reproduzir com o telefone `5512997918525`.
- Corrigir com a menor mudanca possivel.
- Validar no monitor e no envio real antes de encerrar.
