
# Plano: gate de paywall em `/resultado` (Plano de Ação + Oportunidades), mantendo "Sua Projeção" visível

## Comportamento final

| Seção | Acesso | Como exibir |
|---|---|---|
| KPIs, CHS, Funil, Problemas (#1 já liberado) | Como hoje | sem mudança |
| **Sua Projeção** (slider de simulação de ganho) | **Sempre visível** | Movida para fora do `RecommendationsSimulator` |
| **Plano de Ação** (cards #1/#2/#3) | **Bloqueado** se `profile.subscription_status !== "active"` | Blur 6px + overlay escuro + cadeado + CTA "Desbloquear plano de ação" → rola para `#planos-inline` |
| **Oportunidades adicionais** | **Bloqueado** mesma regra | Mesmo tratamento (blur + overlay + cadeado + CTA) |
| Projeção 30 dias / planos inline / etc. | Como hoje | sem mudança |

Regra de destrava: **qualquer plano pago** (`growth` ou `scale`) — uso `isActive = profile?.subscription_status === "active"` que já existe no arquivo (linha 111) e é o mesmo padrão do gate de problemas (linhas 654–688). Visitante anônimo e usuário em trial/starter veem bloqueado.

## Arquivos a editar

### 1. `src/components/resultado/RecommendationsSimulator.tsx`
- **Refator mínimo**: extrair o bloco "Sua Projeção" (cabeçalho, número simulado, slider/legendas) num sub-componente exportado `<ProjectionPreview ... />` que recebe os mesmos cálculos (`visitantes`, `ticketMedio`, `cvrAtualPct`, `recomendacoes`, estado do slider).
- O `RecommendationsSimulator` continua exportando o bloco "Plano de ação · simule seu ganho" (lista de cards #1/#2/#3) — sem a projeção dentro.
- Exportar também `<ProjectionPreview />` (named export) para o `Resultado.tsx` consumir.
- **Não mudo escalas nem cálculos** — só recolocação de JSX. Zero impacto no que está correto hoje.

### 2. `src/pages/Resultado.tsx`
- Reordenar a seção "Recommendations" (linha ~693) para:
  1. **`<ProjectionPreview />`** (sempre visível, fora de qualquer gate)
  2. **Bloco do Plano de Ação** com gate:
     - Se `isActive` → renderizar `<RecommendationsSimulator />` normal.
     - Senão → wrapper `relative`, conteúdo com `filter blur-[6px] opacity-60 pointer-events-none select-none`, overlay `bg-gradient-to-b ... rounded-2xl`, e card central com cadeado + título "Desbloqueie seu plano de ação completo" + subtítulo "+X recomendações priorizadas por impacto e esforço" + botão "Desbloquear plano de ação" que faz `scrollIntoView` no `#planos-inline` (mesmo padrão das linhas 668–687).
- Aplicar **o mesmo wrapper de gate** ao bloco "Oportunidades adicionais" (linha 705):
  - Se `isActive` → render normal.
  - Senão → blur + overlay + card "Desbloqueie X oportunidades adicionais (+R$ Y/mês potencial)" com botão idêntico.
- Sem mudanças na lógica de dados, fetch, recomendação de plano, cálculo de CVR/perda, ou checkout.

### 3. Telemetria (não bloqueia)
- Disparar `trackFunnelEvent("resultado_paywall_view", { section: "plano_acao" | "oportunidades" })` quando o gate aparecer (1× por sessão, via `useEffect` com guard).
- Disparar `trackFunnelEvent("resultado_paywall_cta_click", { section, target: "planos-inline" })` no botão "Desbloquear".
- Já existe `trackFunnelEvent` importado (linha 15), reaproveito.

## Não-objetivos (fora do escopo)
- Não mudo o conteúdo dos cards (texto, números, ordenação).
- Não toco no `gerar-diagnostico`, em `diagnostico-logic.ts`, no DB, em RLS, ou em Edge Functions.
- Não adiciono nova rota nem novo componente de paywall (uso o padrão local, igual ao gate de problemas que já está no arquivo).
- Não mexo no `PaywallModal.tsx` (ele é usado por outras rotas; o de `/resultado` é um banner inline, mais discreto e converte melhor que um modal interruptor numa página de resultado público).
- Sem mudanças em `pricing-constants` ou `recommendPlan`.

## Verificação
- `npx tsc --noEmit` (tipos).
- `npm run test` (Vitest — nenhum teste atual cobre essa seção, mas garante que nada quebrou).
- Inspeção visual em viewport 1395px (atual) e mobile 390px:
  - Anônimo + trial/starter → vê **Sua Projeção** clara, **Plano de Ação** borrado com CTA, **Oportunidades** borradas com CTA.
  - Conta com `subscription_status = "active"` → tudo liberado.

## Risco
Baixo. Refator é localizado em 2 arquivos, o gate replica um padrão já em produção no mesmo arquivo, e a "Sua Projeção" sai intacta — só muda de lugar no DOM.

Posso aprovar e implementar?
