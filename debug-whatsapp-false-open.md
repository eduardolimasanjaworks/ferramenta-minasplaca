# Debug Session: whatsapp-false-open
- **Status**: [OPEN]
- **Issue**: Painel mostra WhatsApp conectado, mas a IA nao responde e o dispositivo indica desconectado
- **Debug Server**: pending
- **Log File**: .dbg/trae-debug-log-whatsapp-false-open.ndjson

## Reproduction Steps
1. Abrir `https://iagmx.sanjaworks.com/phone`
2. Ver o painel exibindo `Pronto, o numero esta conectado e pode responder`
3. Confirmar no aparelho que a sessao nao esta de fato conectada
4. Tentar `status` e `reconectar`
5. Observar divergencia entre UI, API e comportamento real de envio

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | O backend aceita `open`/`conectado` a partir de metadados da Evolution, mas sem validar capacidade real de envio | High | Med | Pending |
| B | `connectionState` e `fetchInstances` continuam divergindo e a reconciliacao atual promove falso positivo | High | Med | Pending |
| C | A instancia tem dados residuais de perfil/ownerJid e a UI usa isso como sinal de sessao valida | Med | Low | Pending |
| D | As duas telas de WhatsApp consomem estados/renderizacoes diferentes e precisam de um mesmo contrato | High | Med | Pending |
| E | O fluxo `reconectar` nao limpa nem revalida o estado operacional depois da reconexao | Med | Med | Pending |

## Log Evidence
- Pending

## Verification Conclusion
- Pending
