#!/usr/bin/env bash
# Fecha as 25 issues cuja implementação foi verificada no tree em f8dfd64
# durante a reconciliação de estado de 2026-09-03.
# Deixa abertas as 7 genuinamente por construir: 4, 47, 48, 49, 50, 53, 54.
set -euo pipefail
REPO="vitorianfonseca/leiritech-system"
ISSUES=(1 2 3 7 12 13 14 25 26 27 28 29 30 31 32 33 35 37 38 39 40 41 42 43 52)

COMMENT="Reconciliação de estado (2026-09-03) — implementação verificada no tree em \`f8dfd64\`, não no ledger.

O build parou em 2026-07-17 antes de escrever a transição \`approved\` → \`integration-review\`, deixando esta issue aberta apesar do código estar construído. Gates medidos no tree atual: \`tsc\` clean, \`lint\` clean, \`npm run build\` clean (49 rotas).

Fechada por auditoria de estado, não por um agente de build."

for n in "${ISSUES[@]}"; do
  if gh issue close "$n" -R "$REPO" -c "$COMMENT" >/dev/null 2>&1; then
    echo "fechada  #$n"
  else
    echo "FALHOU   #$n"
  fi
done

echo "---"
echo -n "abertas agora: "; gh issue list --state open --json number --limit 300 --jq 'length' -R "$REPO"
echo "esperado: 7  (#4 #47 #48 #49 #50 #53 #54)"
