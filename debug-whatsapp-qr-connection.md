# Debug Session: whatsapp-qr-connection
- **Status**: [OPEN]
- **Issue**: QR Code do WhatsApp nao conecta e `status/reconectar` ficam sem estabilizar a sessao
- **Debug Server**: pending
- **Log File**: .dbg/trae-debug-log-whatsapp-qr-connection.ndjson

## Reproduction Steps
1. Abrir `https://iagmx.sanjaworks.com/phone`
2. Ir para o bloco de WhatsApp
3. Clicar em `Abrir QR` ou `Reconectar sessao`
4. Observar que o QR/status nao concluem a conexao

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | O endpoint `/api/whatsapp/reconectar` responde, mas a Evolution nao esta gerando QR para a instancia configurada | High | Low | Pending |
| B | A instancia `gmx-atendimento-v2` esta em estado removido/invalido na Evolution e o backend nao recria corretamente a sessao | High | Med | Pending |
| C | O frontend do `/phone` entra em polling/cooldown, mas interpreta errado o payload de status/qr e nunca exibe o QR atual | Med | Low | Pending |
| D | Existe divergencia entre a URL/chave da Evolution usada pelo backend e o container ativo em producao | Med | Med | Pending |
| E | O backend nao fixa contexto suficiente no prompt para documentos/frete/localizacao, entao a IA deixa de cobrar pendencias minimas do cadastro | High | Med | Pending |

## Log Evidence
- Pending

## Verification Conclusion
- Pending
