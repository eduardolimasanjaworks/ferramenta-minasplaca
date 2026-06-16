# Validação de fluxos — motorista único
Data: 2026-06-15T16:08:26.554Z
Telefone teste: 5511999887766
Modo: sequencial
Fluxos: c6-nonsense-longo
Modelo Claude: claude-sonnet-4-20250514
Pausa entre turnos: 0s

## Entrada nonsense — frase fora de contexto
ID: `c6-nonsense-longo`

### Turno 1 — Motorista
> oi

**GMX** (0 passadas, 0.0s)
- Cenário plano: menu programático (menu)
- Ferramentas: nenhuma
- Fila: 0/4 slots, 0 aguardando

```
Oi parceiro! Sou da GMX — cadastro, disponibilidade ou pagamento?
```

### Turno 2 — Motorista
> o abacate de calças cantou no chuveiro

**GMX** (0 passadas, 0.0s)
- Cenário plano: menu programático (entrada_confusa)
- Ferramentas: nenhuma
- Fila: 0/4 slots, 0 aguardando

```
Perdi o fio da meada aqui, era brincadeira ou tem algo de frete?
```

### Turno 3 — Validação
✅ **OK**

**Fluxo c6-nonsense-longo: OK**

---

## Resumo
- Validações OK: 1
- Validações com falha: 0
- Silêncios corretos: 0
- Turnos processados: 3