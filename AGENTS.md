# iagmx — instruções para agentes

## Plano mestre (fonte da verdade)

**[docs/plano-evolucao-ia-gmx.md](docs/plano-evolucao-ia-gmx.md)**

- Estado atual, próxima tarefa, checklists e log de sessões.
- Atualize esse arquivo ao concluir cada item.

## Plano disparo ERP (portal GMX)

**[docs/plano-disparo-ofertas-gmx.md](docs/plano-disparo-ofertas-gmx.md)** — fases F1–F6.

## Comportamento esperado (validação)

**[docs/referencia-atendimento/](docs/referencia-atendimento/)** — docs 01–07.

## Repositórios

| Repo | Caminho | Stack |
|------|---------|--------|
| iagmx | `app/` | Node, Fastify, Redis, Claude, Evolution |
| gmx | `/root/gmx` | React, Directus |

## Estado crítico (2026-06-15)

- IA **pausada globalmente** até checklist G5 no plano mestre.
- Incidente fila: respostas antigas drenadas — guardrails G1–G4 aplicados.

## Ordem de trabalho recomendada

1. Ler plano mestre → `Próxima tarefa`
2. Implementar → testar → marcar `[x]` no plano
3. Não despausar produção sem G5
