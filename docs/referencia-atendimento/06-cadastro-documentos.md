# 06 — Cadastro e documentos (OCR)

## Objetivo

Coletar documentos **um por vez**, extrair texto (OCR), gravar no Directus, avançar até cadastro completo.

## Ordem obrigatória

1. CNH (foto)
2. CRLV do cavalo
3. ANTT
4. Comprovante de endereço
5. Foto do caminhão (cavalo)

---

## Fluxo padrão — início

```
Motorista: quero me cadastrar
GMX: Pra começar, manda a foto da sua CNH por favor
```

Sem pedir CPF/CNPJ no início — extrair dos documentos.

---

## Fluxo padrão — imagem CNH

```
Motorista: [foto CNH]
```

**Pipeline:**

1. Baixar mídia → cache `midia_id`
2. OCR / visão → texto no contexto (não mostrar dump inteiro ao motorista)
3. Ferramenta:

```json
{
  "ferramenta": "grava_ocr",
  "dados": {
    "tipo": "cnh",
    "midia_id": "abc123"
  }
}
```

```
GMX: CNH recebida parceiro, agora manda a foto do CRLV do cavalo
```

---

## Fluxo padrão — PDF

```
Motorista: [PDF ANTT]
```

Mesmo fluxo: extrair texto do PDF → `grava_ocr` com `tipo: "antt"`.

---

## Fluxo padrão — texto no lugar de foto

```
Motorista: 12345678900
GMX: Preciso da foto da CNH parceiro, manda aí por favor
```

**Sem** chamar `grava_ocr`.

---

## Fluxo padrão — último documento

```
Motorista: [foto caminhão]
GMX: Show parceiro, cadastro enviado pra análise da equipe, em breve te retornamos
```

```json
{
  "ferramenta": "atualizar_motorista",
  "dados": {
    "status_cadastro": "AGUARDANDO VALIDACAO"
  }
}
```

---

## Variações

### V1 — Foto ilegível / borrada

```
GMX: Não consegui ler direito parceiro, manda outra foto da CNH com boa luz
```

Após **2 tentativas** falhas → **🔧 escalonar_equipe** (motivo: `ocr_ilegivel`).

### V2 — Motorista manda documento errado

```
Motorista: [foto comprovante de luz]
GMX: Isso parece comprovante de endereço parceiro, agora preciso da CNH primeiro
```

Manter ordem; não pular etapa.

### V3 — Motorista manda vários de uma vez

```
Motorista: [CNH] [CRLV] [ANTT]
GMX: Recebi a CNH, vou conferir, manda o CRLV separado quando puder
```

Processar **um** por turno (debounce pode juntar — IA deve pedir reenvio organizado ou processar sequencialmente **🔧**).

### V4 — Áudio explicando documento

```
Motorista: [áudio: "tô sem CNH física"]
GMX: Sem problema parceiro, quando tiver a foto manda aqui que eu continuo o cadastro
```

### V5 — Documento via Chatwoot

**Expectativa:** mesmo fluxo que Evolution quando **🔧** webhook baixar anexo.

Hoje: só texto — referência descreve alvo.

### V6 — Evasiva / piada

```
Motorista: manda você aí kkk
GMX: Preciso da foto real parceiro, sem ela não consigo seguir o cadastro
```

Cenário 0 do prompt — sem ferramenta até mídia válida.

---

## OCR — o que extrair (expectativa)

| Documento | Campos desejados no Directus |
|-----------|------------------------------|
| CNH | CPF, registro, validade, nome |
| CRLV | placa, RENAVAM |
| ANTT | RNTRC, validade |
| Endereço | CEP, endereço |
| Foto caminhão | arquivo + confirmação visual |

Extração **assistida** — humano valida depois (`AGUARDANDO VALIDACAO`).

---

## O que NÃO fazer

- Pedir dois documentos na mesma mensagem (“manda CNH e CRLV”)
- Acionar `grava_ocr` sem mídia em cache
- Mostrar JSON ou texto OCR cru ao motorista
- Prometer “cadastro aprovado” — só “enviado para análise”

## Critério de sucesso

| Etapa | Directus |
|-------|----------|
| Cada doc | arquivo na coleção correta + observação OCR |
| Fim | `status_cadastro = AGUARDANDO VALIDACAO` |
