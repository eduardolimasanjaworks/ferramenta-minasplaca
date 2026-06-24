# Debug Session: chat-sync-no-response
- **Status**: [OPEN]
- **Issue**: IA nao responde ao contato `5512982787368` e mensagens inbound nao aparecem no monitor do `/phone`
- **Debug Server**: pending
- **Log File**: .dbg/trae-debug-log-chat-sync-no-response.ndjson

## Hypotheses
- O evento inbound chega no provedor, mas nao entra na persistencia local do atendimento.
- O contato esta pausado, nao liberado, ou associado a um alvo incorreto para envio.
- O worker da fila tenta responder por outro canal/instancia e o envio falha silenciosamente.
- O monitor do `/phone` consulta uma fonte incompleta ou filtra mensagens do usuario/midia.
- Existe erro de parse para anexo/imagem/transcricao e o frontend recebe historico parcial.

## Plan
- Instrumentar somente os pontos de entrada, persistencia, decisao de resposta e leitura do monitor.
- Reproduzir com o contato `5512982787368`.
- Coletar evidencia pre-fix.
- Corrigir com a menor mudanca possivel.
- Validar resposta da IA e espelhamento no monitor.

## Findings
- `GET /api/atendimento/contato/5512982787368` mostrou `ia_modo_global=default_off`, `ia_liberada_contato=false` e `ia_ativa_efetiva=false`.
- `GET /api/monitor/telefone?telefone=5512982787368` mostrou apenas uma mensagem `empresa` e um evento de sistema, sem nenhuma mensagem `user`.
- A causa raiz era dupla:
  - a IA nao respondia porque o contato nao estava liberado individualmente;
  - o inbound do usuario sumia do monitor porque `webhook.ts` descartava a mensagem antes de gravar historico quando `iaPodeResponder()` retornava falso.
- O fluxo oficial/Chatwoot permanecia fora do pipeline local por dois motivos adicionais:
  - a instancia externa `gmx-chatwoot` estava com `state=close` na Evolution oficial;
  - o webhook por instancia da Evolution oficial estava `null`, entao o inbound do numero oficial nao chegava em `/webhook/evolution`.
- Mesmo quando uma `instance` diferente viesse pelo webhook, o backend ainda usava `config.evolutionUrl` e `config.evolutionApiKey` fixos, prendendo envio, digitacao, midia e checagem de canal ao servidor local.

## Fix Applied
- `webhook.ts` agora registra o inbound no historico e no estado do monitor mesmo quando o contato esta pausado.
- O bloqueio de pausa continua impedindo resposta automatica, mas nao apaga mais a visibilidade da mensagem do usuario.
- O contato `5512982787368` foi liberado operacionalmente para voltar a responder no modo `default_off`.
- `evolution.ts`, `canal-envio.ts` e `evolution-instancia.ts` agora resolvem servidor/API key/status pela `instance` real, com teste deterministico cobrindo `gmx-chatwoot` vs fallback local.
- O `app` foi rebuildado/redeployado com essa correcao.
- O webhook da instancia oficial `gmx-chatwoot` foi configurado com sucesso para `https://iagmx.sanjaworks.com/webhook/evolution`.
- O `connect` da instancia oficial foi disparado e a Evolution retornou QR/base64 para novo pareamento do numero oficial.
