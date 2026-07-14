#!/bin/bash
# Guardrail: impede que a IA (ou humano) edite o repositorio legado.

LEGADO="/root/minasplaca-rag/atendimento-minasplaca"
NOVO="/root/minasplaca-rag/minasplaca-clean"

if [ "$PWD" = "$LEGADO" ] || [[ "$PWD" == "$LEGADO"/* ]]; then
  echo "ERRO: este diretorio e o repositorio legado GMX." >&2
  echo "Use $NOVO" >&2
  exit 1
fi

exit 0
