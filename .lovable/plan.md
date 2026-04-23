

# Plano: Refinar Onboarding + Analisando (qualidade de dados ponta a ponta)

Objetivo: elevar a qualidade do diagnóstico desde a captura (onboarding) até a invocação da edge (analisando), com transparência de proveniência, validação de consistência e enriquecimento real do payload.

---

## Bloco A — Onboarding (`src/pages/Onboarding.tsx`)

### A1. Validação de consistência do funil (bloqueante leve)
Antes de `handleFinish`, rodar validador puro `validateFunnelConsistency()`:
- `produto_visto <= visitantes`
- `carrinho <= produto_visto`
- `checkout <= carrinho`
- `pedido <= checkout`
- `ticket_medio` entre 5 e 50.000
- Erros → toast destrutivo + bloqueia avanço; warnings (ex: pedido > 0.5×visitantes) → toast amarelo + libera com confirmação.

Novo arquivo: `src/lib/funnel-validation.ts` + teste `src/lib/__tests__/funnel-validation.test.ts`.

### A2. Marcação de proveniência por campo
Estender o objeto que vai pro sessionStorage com `field_provenance: Record<string,'real'|'estimated'>`:
- Todo campo preenchido pela heurística (`visitantes * 0.72`, etc.) marcado `estimated`.
- Campos vindos de GA4/plataforma → `real`.
- Campos digitados pelo lojista → `real` (declarado).

Calcular `real_signals_pct = real / total` e gravar junto.

### A3. Card "Score de confiabilidade" no último passo
Antes do botão "Acessar dashboard", mostrar resumo compacto:
- Badge `real/derived/estimated` (reusa `DataSourceBadge` da Onda 1).
- Lista 2 linhas: "X campos reais · Y estimados".
- Se GA4 + loja conectados → bloco de reconciliação: "GA4: 12.4k sessões · Loja: 142 pedidos · divergência X%". Alerta âmbar se `|ga4_purchase - orders| / orders > 0.2`.

### A4. Versionamento de draft no localStorage
- Constante `ONBOARDING_DRAFT_VERSION = 2`.
- Ao ler draft, comparar versão; se diferente → descarta e loga `console.info`.
- Ao escrever, sempre incluir `{ version, savedAt, data }`.

### A5. Payload enriquecido para sessionStorage
Adicionar ao `ltv_funnel_data` antes da navegação:
- `device_split` (se GA4 retornou) — `visitantes_mobile/desktop`, `pedidos_mobile/desktop`.
- `field_provenance` (do A2).
- `real_signals_pct` (do A2).
- `data_source_summary` — `{ ga4: bool, loja: bool, manual: bool }`.

---

## Bloco B — Analisando (`src/pages/Analisando.tsx`)

### B1. Idempotência reforçada
Antes do `insert` em `diagnostics_v3`, fazer `select` por `(user_id, store_id)` com janela de 5 min — se existir, pular insert e ir direto pro `/resultado`. Evita duplicatas em retries de rede mesmo com `navigatedToResultadoRef`.

### B2. Polling com backoff (substitui timer fixo de 25s)
- Manter realtime channel como caminho primário.
- Trocar `setTimeout(25000)` por loop de polling: `[3s, 6s, 12s]` consultando `diagnostics_v3` por `user_id`.
- Se nenhuma das 3 tentativas retornar → fallback final igual ao atual.
- Reduz carga em retries e dá UX mais responsiva quando a edge é rápida.

### B3. Telemetria de qualidade
Após persistir (ou falhar), inserir em `funnel_telemetry_events` (já existe) novo evento `diagnostic_generated` com `metadata`:
- `payload_completeness_pct` (campos não-nulos / total)
- `fallback_mode` (boolean)
- `total_ms` (tempo entre invoke e persistência)
- `parse_retry` (boolean — se a edge precisou de regex fallback)
- `enriched_fields` (lista de chaves opcionais que chegaram populadas)

Sem nova tabela; usa `event_name = "diagnostic_generated"`.

### B4. Mensagem de erro orientada a ação
Quando o fallback final dispara (sem diagnóstico), em vez de mandar pra `/resultado` cego:
- Se `data_quality.ga4_diff_pct > 30` → toast "GA4 divergente da loja, reconecte em /integrações".
- Se nenhum canal conectado → toast "Conecte sua loja para diagnóstico real".
- Caso geral → toast "Diagnóstico demorou mais que o esperado. Tentar novamente em 2 min."
- Botão de retry no toast leva pra `/onboarding` ou re-invoca a edge.

---

## Bloco C — Edge `gerar-diagnostico` (`supabase/functions/gerar-diagnostico/index.ts`)

### C1. Aceitar `field_provenance` e `real_signals_pct` no schema Zod
Refletir no `meta.confidence` retornado (já existe da rodada anterior) — usar `real_signals_pct` calculado no client em vez de heurística da edge quando disponível.

### C2. Idempotência server-side (defesa em profundidade)
No início, `select` em `diagnostics_v3` por `(user_id, store_id, created_at > now() - interval '5 minutes')` — se existe, retorna o mesmo `diagnostic_json` com flag `meta.cached = true`. Protege contra retries do client B1.

### C3. Telemetria de parse
Quando o parse JSON da Anthropic falha e cai no regex, marcar `meta.parse_retry = true` na resposta.

---

## Bloco D — Resultado (`src/pages/Resultado.tsx`)

### D1. Exibir reconciliação GA4 vs loja
Se `data_quality.ga4_diff_pct` veio no diagnóstico, mostrar bloco compacto abaixo do selo de confiança:
- "GA4 reporta X% a mais/menos pedidos que sua loja" + link "Reconciliar em /integrações".

### D2. Exibir flag de cache
Se `meta.cached === true` → microbadge cinza "Diagnóstico em cache (5min)" no topo.

---

## O que NÃO muda
- Layout do onboarding (só ganha card de score no último passo).
- Schema do banco — toda telemetria reusa `funnel_telemetry_events` e `diagnostics_v3`.
- Fluxo navegacional — mesmas rotas, mesmas transições.
- `chs`, `chs_label`, `recommended_plan` continuam calculados como hoje.

## Fora deste escopo
- Dashboard de telemetria (queries de `diagnostic_generated` ficam para análise ad-hoc via SQL).
- Reconexão GA4 in-place a partir do `/resultado` — só link para `/integracoes`.
- A/B test de threshold de divergência GA4 (fixar 20% por ora).

## Notas técnicas
- `validateFunnelConsistency` é função pura sem dependência de React → fácil de testar.
- Backoff em B2 usa `setTimeout` encadeado dentro de função async, cancelável via flag em cleanup do `useEffect`.
- Idempotência B1+C2 é defesa em camadas: client evita maioria dos casos, server cobre race conditions reais.
- `field_provenance` é `Record<string,string>` simples → serializa direto pra JSON sem overhead.

