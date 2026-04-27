# Plano: Remover GA4 do Onboarding (manter no Dashboard)

## Estratégia

- **Onboarding:** GA4 some. Termina no passo 3 (conectar plataforma) e vai direto para `/analisando`.
- **Dashboard:** GA4 continua 100% funcional em `/dashboard/configuracoes` e `/dashboard/integracoes`.
- **Fluxo operacional:** quando você libera a loja (após compra), adiciona o e-mail dela como test user no Google Cloud Console e o lojista conecta GA4 pelo dashboard quando quiser.

---

## Mudanças

### 1. Onboarding (`src/pages/Onboarding.tsx`)
- `TOTAL_STEPS = 3` (era 4).
- Remover render do passo 4 (GA4).
- Após salvar o passo 3, redirecionar direto para `/analisando`.
- Remover do estado/efeitos: `ga4PropertyId`, `ga4Token`, `ga4Testing`, `ga4Result`, `ga4OauthConnecting`, `ga4ConnectedEmail`, `ga4Properties`, `ga4LoadingProperties`, `ga4ManualMode`, polling de tokens, listener `postMessage`, `handleGA4Connect`, `handleTestGA4`, validação cruzada GA4↔plataforma.
- Limpar do draft persistido (localStorage) os campos `ga4PropertyId` / `ga4Token`.

### 2. Diagnóstico (`Analisando.tsx` + `Resultado.tsx`)
- Continuar lendo `funil_diario` / GA4 se existir (lojas que conectaram GA4 pelo dashboard depois).
- Tratar `visitantes = 0` como caso normal (sem warning de "GA4 divergente"):
  - Esconder card "Visitantes" e linha "GA4 reporta X% a mais/menos pedidos" quando não há dado GA4.
  - Substituir KPI de "Taxa de conversão geral" por **"Ticket médio / Recompra / Pedidos"** quando não há visitantes.
- Edge `gerar-diagnostico`: aceitar input sem visitantes e gerar análise focada em LTV, recorrência e abandono de carrinho (dados que vêm da plataforma).

### 3. Dashboard
- **Sem mudanças** em `Configuracoes.tsx` e `Integracoes.tsx` — GA4 continua disponível normalmente.
- Opcional: tooltip/nota leve ao lado do botão "Conectar GA4" → "Acesso liberado individualmente durante verificação Google. Fale com o suporte se aparecer erro."

---

## Arquivos editados

1. `src/pages/Onboarding.tsx` — remover passo 4 e toda a lógica GA4.
2. `src/pages/Analisando.tsx` — tornar GA4 opcional (sem warning quando ausente).
3. `src/pages/Resultado.tsx` — esconder cards/labels GA4 quando `visitantes = 0`.
4. `supabase/functions/gerar-diagnostico/index.ts` — aceitar payload sem campos de funil de topo.

**Sem migrações. Sem mudanças no Dashboard. Edge functions GA4 e crons continuam intactos.**

---

## Quando o Google aprovar

Apenas reverter o passo 1 (restaurar passo 4 do onboarding). Tudo o mais já estará pronto.

---

Posso prosseguir?
