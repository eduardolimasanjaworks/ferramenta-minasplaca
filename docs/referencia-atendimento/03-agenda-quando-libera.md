# 03 — Agenda / quando o motorista libera (carregado)

## Objetivo

Quando o motorista **não está disponível agora**, registrar **quando** estará — para a operação planejar oferta e **🔧 recontatar** na data.

Isso não é “cron no WhatsApp”; é **dado no ERP** + (futuro) **job que dispara contato**.

---

## Fluxo padrão

Pré-requisito: motorista já classificado como **carregado** e informou **destino**.

```
GMX: E em que data você estará liberado para carregar?
Motorista: dia 20/06 / sexta / libero amanhã
GMX: Show parceiro, anotei pra [data], boa viagem
```

**Sistema:**

```json
{
  "ferramenta": "registrar_disponibilidade",
  "dados": {
    "disponivel": false,
    "status": "carregado",
    "localizacao_atual": "Belo Horizonte MG",
    "data_previsao_disponibilidade": "2026-06-20 08:00:00"
  }
}
```

---

## Regras de interpretação de data

| Motorista diz | Interpretação esperada |
|---------------|------------------------|
| “sexta-feira” | Próxima sexta a partir de hoje |
| “20/06” | 2026-06-20 08:00:00 (ano corrente) |
| “amanhã” | D+1 08:00:00 |
| “daqui uns 3 dias” | D+3 08:00:00 (confirmar se ambíguo) |
| “não sei” | **Não salvar** — pedir estimativa |

---

## Variações

### V1 — Data + hora explícita

```
Motorista: libero sexta às 14h
→ data_previsao_disponibilidade: "2026-06-20 14:00:00"
```

### V2 — Só destino, sem data ainda

```
Motorista: to indo pro RJ
GMX: Entendido, em que data você libera pra carregar?
```

Não chamar ferramenta sem data válida.

### V3 — Motorista corrige data

```
Motorista: na verdade só libero segunda
GMX: Atualizei pra segunda então parceiro, boa viagem
```

Nova chamada `registrar_disponibilidade` (patch no Directus).

### V4 — 🔧 Recontato automático na data

**Expectativa de produto (não só IA):**

```
[data_previsao_disponibilidade chega]
Sistema: envia WhatsApp proativo
GMX: Fala parceiro, você comentou que liberava hoje, ainda tá na pegada ou já pode carregar?
```

IA assume a partir da resposta (volta ao Cenário 7).

---

## O que NÃO fazer

- Salvar “logo”, “depende”, “quando descarregar” sem data estimável
- Usar agenda para motorista **vazio** (vazio = disponível agora + localização)
- Prometer “a gente te liga nessa data” sem o job de recontato existir (pode dizer “anotei no sistema”)

## Alinhamento ERP

Confirmar com vocês:

- `data_previsao_disponibilidade` é só informativo para equipe?
- Ou deve disparar automação iagmx/Directus?

Nossa expectativa técnica: **os dois** — salvar sempre; automação é camada separada.
