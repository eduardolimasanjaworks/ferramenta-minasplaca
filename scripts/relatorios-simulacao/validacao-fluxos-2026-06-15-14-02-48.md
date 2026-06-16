# Validação de fluxos — motorista único
Data: 2026-06-15T14:02:48.147Z
Telefone teste: 5511999887766
Modo: sequencial
Fluxos: c8-cadastro-inicio
Modelo Claude: claude-sonnet-4-20250514
Pausa entre turnos: 0s

## Cenário 8 — Cadastro (início CNH)
ID: `c8-cadastro-inicio`

### Turno 1 — Motorista
> quero me cadastrar

**GMX** (0 passadas, 0.0s)
- Cenário plano: cadastro programático (cadastro_inicio)
- Ferramentas: nenhuma
- Fila: 0/4 slots, 0 aguardando

```
Beleza parceiro, vamos fazer seu cadastro, manda a foto da sua CNH por favor
```

### Turno 2 — Validação
✅ **OK**

### Turno 3 — Motorista
> 12345678900

**GMX** (0 passadas, 0.0s)
- Cenário plano: cadastro programático (reprompt_cnh)
- Ferramentas: nenhuma
- Fila: 0/4 slots, 0 aguardando

```
Preciso da foto da CNH parceiro, manda aí por favor
```

### Turno 4 — Validação
✅ **OK**

**Fluxo c8-cadastro-inicio: OK**

---

## Resumo
- Validações OK: 2
- Validações com falha: 0
- Silêncios corretos: 0
- Turnos processados: 4