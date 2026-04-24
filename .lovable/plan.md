
# Plano: corrigir dados de `/resultado` (todos os blocos com problema)

Como você confirmou que **tudo** está errado (R$, CVR, recomendações da IA, plano sugerido) e a **fonte** é desconhecida, o plano agora é uma auditoria end-to-end do funil `Onboarding → Analisando → gerar-diagnostico → Resultado`, mapear cada número exibido até sua fórmula/origem, e corrigir num PR único.

## Etapa 1 — Auditoria (read-only, eu faço ao aprovar)

Vou ler e mapear cada widget de `/resultado` à sua origem:

1. `src/pages/Resultado.tsx` — fluxo de carregamento, props passadas a `RecommendationsSimulator`, formatadores.
2. `src/pages/Analisando.tsx` — payload enviado a `gerar-diagnostico` e onde grava (`diagnostics_v3.diagnostic_json`?).
3. `src/pages/Onboarding.tsx` + `src/lib/funnel-validation.ts` — escala/unidade dos campos coletados (visitantes mensais? abandono em 0–1 ou 0–100? ticket em reais?).
4. `src/lib/diagnostico-logic.ts` — `calcDiagnostico` (carrinhos perdidos, receita perdida, plano).
5. `supabase/functions/gerar-diagnostico/index.ts` — system prompt, escala de `impacto_pp` e `impacto_reais`, parsing.
6. `src/components/resultado/RecommendationsSimulator.tsx` — já mapeado; valido apenas as **props recebidas**.
7. **Banco** (via `supabase--read_query`): última linha em `diagnostics_v3` + `funnel_metrics_v3` + `diagnostics` da minha conta de teste para ver os números reais que estão alimentando a tela.

Entrego uma **tabela "número exibido → fórmula → fonte → status (ok/bug)"** antes de codar.

## Etapa 2 — Bugs prováveis a confirmar

| # | Bug suspeito | Sintoma na tela |
|---|---|---|
| A | `cvrAtualPct` passado como fração (0.014) em vez de % (1.4) | "CVR atual" mostrando 0.01% e projeção absurda |
| B | `taxa_abandono` salvo em 0–100 mas usado como 0–1 (ou inverso) em `calcDiagnostico` | Receita perdida 100× maior/menor |
| C | `visitantes` no simulador vindo de campo diário/anual mas tratado como mensal | Receita extra fora de escala |
| D | IA devolvendo `impacto_pp` em escala inconsistente (0.82 vs 82) | Recomendações com +pp absurdos / soma > 100 |
| E | `Resultado` lendo de `diagnostics` (legado) em vez de `diagnostics_v3` | Mostra mock antigo, ignora o que `Analisando` salvou |
| F | `gerar-diagnostico` falhando em parse → fallback mock silencioso | Recomendações genéricas sempre iguais |
| G | `planoSugerido` baseado em faturamento/clientes mensais, mas recebendo valor anual (ou vice-versa) | Plano sempre "scale" ou sempre "starter" |
| H | `ticketMedio` em centavos vs reais em algum ponto da cadeia | Receita perdida 100× errada |

## Etapa 3 — Correções (no modo default, num único commit)

Para cada bug confirmado:
- **Padronizar escalas no contrato**: visitantes = mensais; CVR = %; abandono = 0–1; ticket = reais; `impacto_pp` = pontos percentuais (ex.: 0.82). Documentar com JSDoc nos tipos.
- **Endurecer `gerar-diagnostico`**:
  - Prompt explícito: "números sem separador de milhar, `impacto_pp` em pp (ex.: 0.5 = meio ponto), `impacto_reais` em reais inteiros".
  - Verificar `stop_reason` da Anthropic; se `max_tokens`/`length`, subir limite e re-tentar.
  - `extractJSON` robusto (sem regex destrutivo) + validação Zod do shape antes de salvar.
  - Fallback NÃO-silencioso: se IA falhar, gravar `status='failed'` em vez de mock, e a UI mostra retry.
- **`Resultado.tsx`**: ler **sempre** o último `diagnostics_v3` do usuário (`order by created_at desc limit 1`) com `.maybeSingle()`. Se vazio, redirecionar para `/analisando`. Adicionar badge de proveniência (real vs estimated) usando `data-provenance.ts`.
- **`calcDiagnostico`**: adicionar testes unitários (Vitest) cobrindo casos-limite (abandono 0, 1, ticket 1, visitantes 0) e os bugs B/C/H acima — todos baseados em fixtures reais do seu banco.
- **Validações cruzadas** (inspirado no padrão sugerido): após calcular, verificar `receita_perdida ≈ carrinhos_perdidos × ticket` (±1%) e `Σ impacto_pp ≤ 100 - cvr_atual`. Se romper, logar `client_error_events` e mostrar warning no card.

## Etapa 4 — Verificação

- `npm run test` (Vitest) — incluindo novos casos de `diagnostico-logic`.
- Reproduzir o fluxo na minha conta de teste via `browser--navigate_to_sandbox`: `/onboarding` → `/analisando` → `/resultado`, confirmando cada KPI vs valor calculado à mão.
- Comparar com o registro novo em `diagnostics_v3` (`supabase--read_query`).

## Arquivos provavelmente editados

- `src/pages/Resultado.tsx`
- `src/pages/Analisando.tsx` (se persistência for o ponto)
- `src/lib/diagnostico-logic.ts` + novo `src/lib/__tests__/diagnostico-logic.test.ts` (ou expandir o existente)
- `supabase/functions/gerar-diagnostico/index.ts`
- `src/components/resultado/RecommendationsSimulator.tsx` (apenas se as escalas das props mudarem)

Sem mudanças de schema. Nenhum secret novo.

## Antes de aprovar

Se quiser acelerar, me diga **qual loja/usuário** posso usar para inspecionar os registros reais (ou autorize que eu pegue o último diagnóstico da sua conta automaticamente). Sem isso, eu uso o usuário mais recente da tabela `diagnostics_v3` como amostra para reproduzir.
