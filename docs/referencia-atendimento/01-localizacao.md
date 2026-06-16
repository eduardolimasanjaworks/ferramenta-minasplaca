# 01 — Localização do motorista

## Objetivo

Saber **onde o motorista está agora** para ofertar frete perto. Duas formas válidas:

1. **Cidade e estado** escritos (“Campinas SP”, “tô em Guarulhos”)
2. **Pin do WhatsApp** (“Localização atual” / latitude + longitude)

## Gatilhos

- Cenário 7 (disponibilidade) após motorista dizer que está **vazio**
- Cenário 5 (oferta) quando falta localização na resposta
- Motorista manda pin ou cidade espontaneamente no meio de qualquer fluxo de disponibilidade

---

## Fluxo padrão — cidade escrita

```
GMX (se proativa): Estamos atualizando nossa base... confirmação rápida
Motorista: pode sim
GMX: Show parceiro, você está disponível (vazio) ou já está carregado?
Motorista: vazio
GMX: Perfeito, manda sua localização atual pelo clipe ou me diz cidade e estado
Motorista: Campinas SP
GMX: Show parceiro, dados atualizados, boa viagem e vai com Deus
```

**Sistema (ao receber cidade válida):**

```json
{
  "ferramenta": "registrar_disponibilidade",
  "dados": {
    "disponivel": true,
    "status": "disponivel",
    "localizacao_atual": "Campinas SP"
  }
}
```

---

## Fluxo padrão — pin GPS (Localização atual)

```
Motorista: [anexo: localização -23.55, -46.63]
GMX: Show parceiro, anotei sua posição, boa viagem
```

**Sistema:**

```json
{
  "ferramenta": "registrar_disponibilidade",
  "dados": {
    "disponivel": true,
    "status": "disponivel",
    "latitude": -23.5505,
    "longitude": -46.6333,
    "localizacao_atual": "São Paulo SP"
  }
}
```

- `latitude` / `longitude`: do anexo
- `localizacao_atual`: **🔧 reverse geocoding** ou cidade confirmada pelo motorista se geocoding falhar

**Expectativa:** não pedir de novo “cidade e estado” se o pin for válido e a cidade foi resolvida.

---

## Variações

### V1 — Referência vaga

```
Motorista: tô perto do posto na rodovia
GMX: Preciso da cidade e estado parceiro, ou manda a localização pelo clipe
```

Não avançar. Não chamar ferramenta.

### V2 — Só “sim” / “ok” na pergunta vazio/carregado

```
GMX: você está vazio ou carregado?
Motorista: sim
GMX: Fiquei na dúvida parceiro, você está vazio ou carregado?
```

### V3 — Cidade sem UF

```
Motorista: tô em Campinas
GMX: Campinas de qual estado parceiro?
```

### V4 — Pin + cidade redundante

```
Motorista: [pin] e tô em Sumaré
GMX: Show, anotei Sumaré SP, boa viagem
```

Priorizar texto explícito; pin como reforço nas coordenadas.

### V5 — Localização no meio da oferta (Cenário 5)

```
GMX: Temos uma carga Guarulhos → Curitiba R$ 4.500, onde você tá e tem interesse?
Motorista: to em SP interior
GMX: Qual cidade e estado parceiro, e topa essa carga?
```

Só depois de cidade válida + interesse → fechamento ou negociação.

### V6 — Chatwoot manda localização como texto

Histórico real: `**Location:** Latitude: -3.87...`

**Expectativa:** tratar como GPS (mesmo fluxo do pin), não ignorar por ser texto formatado.

---

## O que NÃO fazer

- Aceitar “aqui”, “na estrada”, “perto de casa” como localização final
- Perguntar data de liberação quando motorista já disse que está **vazio**
- Inventar cidade a partir de GPS sem confiança (melhor confirmar: “anotei região de Campinas, confirma?”)

## Critério de sucesso

| Check | Esperado |
|-------|----------|
| Cidade válida | `localizacao_atual` no Directus |
| Pin válido | `latitude`, `longitude` + cidade quando possível |
| Motorista recebe confirmação curta | Sem JSON visível no WhatsApp |
