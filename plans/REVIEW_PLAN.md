# Plano de revisão — remoções e adições

Decidido com o utilizador a 2026-09-12. Contexto que enquadra tudo:
**a equipa são 3 pessoas.** Ferramenta interna, empresa única, invite-only.

**Executar só depois de o dispatcher (#47/#48/#49/#50/#53/#54) terminar e commitar.**

---

## Remoções

### R1 — `/settings/theme`
Tema e idioma são mudáveis em **quatro** sítios: `shell/topbar.tsx`,
`shell/footer.tsx` (idioma), `settings/theme-settings-view.tsx` e
`profile/preferences-section.tsx`.

Apagar: a página, `components/settings/theme-settings-view.tsx` (109 linhas).
Manter: topbar (acesso rápido) + `/profile` (preferência persistida).
Tocar ainda: `settings-nav.tsx`, chaves `settings.theme.*` em `pt-PT.json` / `en.json`.

### R2 — `/settings/roles` + `/settings/states`
251 linhas que apresentam como configuração aquilo que as BR fixam. Nada ali é editável.

Apagar: as duas páginas, `roles-settings-view.tsx` (132), `states-settings-view.tsx` (119).
**O sistema de papéis em si FICA** (ver "Mantido"). São só as páginas de exposição
que saem; o conteúdo passa para a documentação.

### R3 — `/settings/audit`
Painel de issues GitHub filtrado para findings de auditoria. Ferramenta de
desenvolvimento, não funcionalidade de negócio — e a nova tab **GitHub** no
detalhe do projeto cobre o caso de uso.

Apagar: a página, `audit-settings-view.tsx` (106).
Deixa `GithubIssuesPanel` com um único consumidor: a tab GitHub.

### R4 — `/settings/tags` — **a funcionalidade já estava morta**
`EntityTag` está definido em `models/collaboration.py:125` e exportado em
`models/__init__.py`, mas **nenhum serviço, repositório ou endpoint lhe toca**.
Criavam-se etiquetas que não se podiam aplicar a nada.

Apagar: página, `tags-settings-view.tsx` (198), `tag-form-dialog.tsx` (143),
serviço e endpoints de tags, modelos `Tag` e `EntityTag`.
**Migração Alembic com `DROP TABLE tags, entity_tags`** — estão vazias, não há dados a perder.

### R5 — Relatórios + export CSV
Superfície: `services/report_service.py` (280), `core/csv_export.py` (45),
`api/routes/reports.py`, `repositories/reports.py`, `schemas/reports.py`,
a página `/reports` e 8 componentes em `components/reports/`.

**Inclui `/settings/export`, que é mock.** O código admite-o:
> `// Mock export: real backend streams the dataset; here we emit a valid CSV`
> `// with the column headers + a sample row so the action is never a dead end.`

Uma funcionalidade que finge funcionar é pior do que uma que não existe.

### R6 — Equipa + workload / capacidade
294 linhas backend + 13 ficheiros frontend para planear a carga de 3 pessoas —
algo que se sabe de cabeça.

Apagar: `services/workload_service.py`, a página `/team`, `/settings/capacity`,
e a automação **AUTO-12 `workload_recompute`** (deixa de ter o que recalcular).
Verificar o que no dashboard lê workload antes de cortar.

---

## Alterações

### N1 — Notificações: manter as 12 regras, mudar o canal
As 12 automações (1156 linhas) são o valor real — pagamento em atraso, proposta
a expirar, tarefa atrasada. O que falha é o **canal**: um centro de notificações
dentro da app só avisa quem lá entra.

Passar a entregar por **email**. `services/email_service.py` e `RESEND_API_KEY`
já existem — a infraestrutura está lá.
Decidir se o centro in-app fica como histórico ou sai também.
**AUTO-12 sai** junto com o workload (R6): ficam 11 regras.

---

## Mantido (decidido explicitamente, não por omissão)

- **Sistema de papéis (Admin / Gestor / Membro), BR-002 e BR-008.** Ponderou-se
  removê-los ("toda a gente vê tudo") e decidiu-se manter: com 3 pessoas ainda dá
  jeito ter alguém que não vê números. As issues #49/#50 do dispatcher continuam
  a fazer sentido e **não são canceladas**.
- Reuniões, comentários + menções, convites.
- Catálogo de serviços, templates de proposta, calendário agregado.

---

## Adições

### A1 — Avenças / contratos recorrentes
Zero ocorrências de `retainer`/`recurring` no código. Hoje uma manutenção mensal
obrigaria a criar um projeto novo todos os meses.

**Entidade `Contract` própria** — periodicidade, valor, vigência — a gerar marcos
de pagamento. Separa a relação comercial contínua do projeto com início e fim:
ciclos de vida diferentes. Liga a F14 e alimenta receita previsível no dashboard.

### A2 — Portal de cliente — **a de maior risco**
Link partilhável só-de-leitura com **apenas fases e marcos**. Sem tarefas, sem ficheiros.

Requer rotas **públicas não autenticadas** — postura de segurança nova numa app
inteiramente invite-only. Precisa de tokens com validade e revogação, allowlist
explícita de campos (BR-008 é crítico: nada de financeiro, margens ou custos) e
rate limiting próprio. **Desenho e revisão de segurança próprios antes de código.**
Trabalho de várias sessões, não de uma tarde.

### A3 — GitHub mais profundo
Já existe integração de issues (`bd85c82`, `695fb3b`) e agora a tab própria.
Extensão: ligar PRs/commits a tarefas e transicionar a tarefa no merge do PR.
Numa equipa de 3 developers, remove fricção diária a toda a gente.
Requer webhooks → endpoint público com verificação de assinatura HMAC.

---

## Descartado

- **Férias e ausências.** Recomendei-as antes de saber que eram 3 pessoas.
  Existiam para descontar da capacidade; cortada a capacidade (R6), ficariam uma
  lista sem consequência.

---

## Ordem de execução

1. **R1–R3** — baratas, sem migração, reduzem ruído primeiro
2. **R5 + R6** — remoções grandes, sem migração de dados
3. **R4** — tags, com a migração `DROP TABLE`
4. **N1** — notificações por email
5. **A1** — avenças
6. **A3** — GitHub / webhooks
7. **A2** — portal de cliente, por último, com desenho de segurança próprio
