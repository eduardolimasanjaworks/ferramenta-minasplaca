# 02 — Vazio (disponível) vs carregado

## Objetivo

Classificar o motorista para o ERP:

- **Vazio / disponível** → quer carga agora; foco em **localização**
- **Carregado / em viagem** → foco em **destino** + **quando libera**

## Gatilhos

- Mensagem proativa GMX de disponibilidade (texto padrão da base)
- Motorista escolhe “disponibilidade” no menu
- Motorista pergunta “tem carga?”, “tô vazio”, “tô carregado”

---

## Fluxo padrão — entrada proativa

```
GMX: Estamos atualizando nossa base de parceiros para novas ofertas de frete...
Motorista: ok / pode / manda
GMX: Show parceiro, você está disponível (vazio) ou já está carregado?
```

**Regra crítica:** “ok” e “sim” **não** preenchem vazio/carregado. É só autorização para continuar.

---

## Ramo A — VAZIO

```
Motorista: vazio / to livre / disponível
GMX: [pede localização — ver doc 01]
→ após local válida → registrar + despedida
```

```json
{
  "ferramenta": "registrar_disponibilidade",
  "dados": {
    "disponivel": true,
    "status": "disponivel",
    "localizacao_atual": "Goiânia GO"
  }
}
```

**Não perguntar:** “quando você libera?” / data de embarque.

---

## Ramo B — CARREGADO

```
Motorista: carregado / em viagem / to cheio
GMX: Entendido, pra qual cidade e estado você está indo?
Motorista: Rio de Janeiro RJ
GMX: E em que data você estará liberado para carregar?
Motorista: libero sexta-feira
GMX: Show parceiro, dados atualizados, boa viagem
```

```json
{
  "ferramenta": "registrar_disponibilidade",
  "dados": {
    "disponivel": false,
    "status": "carregado",
    "localizacao_atual": "Rio de Janeiro RJ",
    "data_previsao_disponibilidade": "2026-06-20 08:00:00",
    "observacao": "Destino informado pelo motorista"
  }
}
```

- Destino na `localizacao_atual` ou campo específico de destino (**alinhar com ERP**)
- Data em formato ISO; hora padrão 08:00 se não informada

---

## Variações

### V1 — Resposta ambígua

```
Motorista: mais ou menos / depende
GMX: Fiquei na dúvida parceiro, você está vazio ou carregado?
```

### V2 — Vazio com destino preferido espontâneo

```
Motorista: vazio, queria algo pro sul
GMX: Anotei que tá vazio, me manda localização atual ou cidade e estado onde você tá
```

Não abrir negociação de frete sem oferta ativa no histórico.

### V3 — Carregado com data vaga

```
Motorista: logo / não sei
GMX: Preciso de uma estimativa de data parceiro, que dia acha que libera?
```

### V4 — Via menu (sem mensagem proativa)

```
Motorista: disponibilidade
GMX: Show parceiro, você está vazio ou carregado?
```

Mesmo fluxo dos ramos A/B.

### V5 — Encerramento + silêncio

```
GMX: Show parceiro, dados atualizados, boa viagem
Motorista: valeu
[IA não responde]
```

---

## O que NÃO fazer

- Tratar primeiro “ok” como “vazio”
- Pedir localização antes de saber vazio vs carregado (exceto se motorista já disse “vazio” direto)
- Repetir menu Cenário 6 no meio do fluxo 7

## 🔧 Expectativa futura

- Worker que lê `data_previsao_disponibilidade` e recontata motoristas carregados na data (doc 03)
