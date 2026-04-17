# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server on port 8080
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run tests once (Vitest)
npm run test:watch   # Run tests in watch mode
npm run preview      # Preview production build
npm run validate:env          # Valida frontend + edge (env exportado)
npm run validate:env:frontend # Só VITE_* (build / Vercel)
npm run validate:env:edge     # Secrets das Edge Functions
npm run supabase:migration-list  # Local vs remoto (migrações); ver docs/supabase-migrations-sync.md
npm run supabase:db-push         # Aplica migrações pendentes no projeto linkado
npm run supabase:db-push:include-all  # Idem, com --include-all (ordem fora de linha; ver doc)
npm run release:check         # Smoke + ProtectedRoute + env opcional (ver docs/production-env-checklist.md)
npm run test:e2e              # Playwright (e2e/); CI usa preview em :4173 + PLAYWRIGHT_BASE_URL
```

## Produção / compliance (checklist curto)

- **Migrações:** alinhar remoto com `npm run supabase:migration-list` / `supabase db push --linked` (ver `docs/supabase-migrations-sync.md`).
- **Pagamento (Mercado Pago):** deploy Edge `mercadopago-webhook` (sem JWT) e `mercadopago-create-preference`; secrets `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, opcional `MP_PLAN_TO_TIER` JSON. Checkout via `external_reference` = `{ user_id, plan_key, billing_cycle }` e metadata `plan_tier`. Único provedor suportado.
- **Crons:** `CRON_SECRET`, `PROCESS_SCHEDULED_MESSAGES_SECRET` — rotacionar periodicamente; monitorizar logs com tag `CRON_ALERT`.
  - `PROCESS_SCHEDULED_MESSAGES_SECRET` é aceito por `process-scheduled-messages` **e** por `dispatch-newsletter` (header `x-internal-secret`) para disparar newsletters em background. Escopo: apenas campanhas de e-mail já criadas pelo owner da loja. Se vazar, um atacante pode disparar newsletters de qualquer loja — rotacionar imediatamente e auditar `audit_logs` com `action = "newsletter_internal_dispatch"`.
  - `DISPATCH_CAMPAIGN_SECRET` é aceito por `dispatch-campaign` para campanhas WhatsApp internas (cron/automations). Escopo: campanhas já vinculadas a uma loja. Rotacionar junto com `PROCESS_SCHEDULED_MESSAGES_SECRET`.
- **Supabase:** plano pago com **PITR / backups** ativos para dados de clientes.
- **LGPD:** bases legais e retenção documentadas; fluxo de exportação/eliminação de conta alinhado ao DPO (o `unsubscribe` e logs de auditoria já existem — rever políticas de retenção em `webhook_logs` / `api_request_logs`).

## Architecture

**Stack**: Vite + React 18 + TypeScript + React Router 6 + TanStack Query 5 + Tailwind CSS + shadcn/ui + Supabase

LTV Boost is a WhatsApp marketing SaaS for Brazilian e-commerces. The app has two main surfaces:

1. **Marketing site** — public pages at `/`, `/sobre`, `/pricing`, etc.
2. **Dashboard** — protected SaaS app at `/dashboard/*`

### Key conventions

- Path alias `@/` maps to `src/` — use this for all imports
- `cn()` from `src/lib/utils.ts` merges Tailwind class names
- All shadcn/ui components are in `src/components/ui/` — do not modify them directly
- Colors are HSL CSS variables in `src/index.css`; dark mode supported via `next-themes`
- TypeScript is loose: `noImplicitAny` and `strictNullChecks` are disabled

### Auth flow

- `src/hooks/useAuth.ts` — Supabase Auth hook (user, session, profile, signIn, signUp, signOut, isTrialActive, isPaid)
- `src/components/ProtectedRoute.tsx` — redirects unauthenticated users to `/login`
- On signup → auto-redirect to `/onboarding` (3-step wizard)
- Dashboard routes all wrapped in `<ProtectedRoute>` via `DashboardRoute` in App.tsx

### Data layer

- `src/lib/supabase.ts` — typed Supabase client
- `src/lib/database.types.ts` — TypeScript types for all tables
- `src/hooks/useDashboard.ts` — TanStack Query hooks for dashboard data
- Supabase credentials in `.env` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)

### Dashboard structure

- `src/components/dashboard/DashboardLayout.tsx` — sidebar nav + mobile hamburger
- `src/pages/dashboard/` — one file per section:
  - `Dashboard.tsx` — KPIs, charts, recent activity
  - `Inbox.tsx` — split-pane conversation view
  - `Campanhas.tsx` + `CampaignModal.tsx` — campaign list + 3-step creation modal
  - `Contatos.tsx` — contacts table with filters
  - `Automacoes.tsx` — automation templates (cart, win-back, birthday, post-purchase)
  - `CarrinhoAbandonado.tsx` — abandoned cart monitoring and recovery
  - `Reviews.tsx` — review aggregation + AI reply suggestions
  - `Analytics.tsx` — charts with period selector
  - `WhatsApp.tsx` — WhatsApp **Meta Cloud** (`whatsapp_connections.provider = meta_cloud`)
  - `Configuracoes.tsx` — profile, credenciais Meta / webhook URLs
  - `Billing.tsx` — plan comparison, usage meters, trial countdown

### External integrations

- `src/lib/meta-whatsapp-client.ts` — Cliente browser para **Meta Cloud** via edge `meta-whatsapp-send` (JWT + `connectionId`). Secrets: `META_WHATSAPP_VERIFY_TOKEN` + `META_APP_SECRET`; webhook `meta-whatsapp-webhook`. Ver `docs/meta-whatsapp-cloud-setup.md`.
- `supabase/functions/webhook-cart/index.ts` — Deno edge function, receives abandoned cart events from Shopify/Nuvemshop/Tray/VTEX/WooCommerce

### Database migrations (run in order in Supabase SQL Editor)

1. `supabase/schema.sql` — core tables (contacts, conversations, messages, campaigns, analytics_daily)
2. `supabase/phase1-migration.sql` — profiles, whatsapp_connections, campaign_segments, abandoned_carts, RLS policies (`handle_new_user` → row in `profiles` per signup)
3. `supabase/phase2-migration.sql` — automations, reviews, review_requests
4. `supabase/migrations/*.sql` — apply in timestamp order for RLS hardening (`20260407170000_harden_rls_and_contracts.sql`, etc.), inbox, ConvertIQ, newsletter tables, and `system_config`
5. `supabase/migrations/20260407131337_35a41ebc-7255-43f5-b0f1-49c4d3bfbcfe.sql` — `handle_new_user_store` trigger (creates `stores` row on `auth.users` insert)

**Pre-beta checklist (Supabase Dashboard)**

- **Authentication → URL configuration:** Site URL and Redirect URLs match production; recovery flow targets `/reset-password`.
- **Authentication → Providers / Email:** If email confirmation is required, verify deliverability (SMTP or Supabase default) so signups do not stall in limbo.
- **SQL:** Confirm `profiles` and `stores` exist for a test user after signup; policies on tenant tables use `auth.uid()` (see migrations above).

**Edge Functions:** Deploy any function the environment will call. Folders live under `supabase/functions/`.

| Called from `src/` (`functions.invoke`) | Folder |
|-----------------------------------------|--------|
| `fetch-store-metrics` | `fetch-store-metrics` |
| `gerar-diagnostico` | `gerar-diagnostico` |
| `buscar-ga4` | `buscar-ga4` |
| `ai-reply-suggest` | `ai-reply-suggest` |
| `dispatch-campaign` | `dispatch-campaign` |
| `dispatch-newsletter` | `dispatch-newsletter` |
| `send-email` | `send-email` (e.g. `useEmailSender`) |
| `unsubscribe-contact` | `unsubscribe-contact` |
| `meta-whatsapp-send` | `meta-whatsapp-send` (envio Cloud API; JWT + `connectionId`) |
| `sync-funil-ga4` | `sync-funil-ga4` — grava `funil_diario` a partir do GA4 da loja (`stores.ga4_*`); **cron** com `Authorization: Bearer CRON_SECRET` |
| `data-pipeline-cron` | `data-pipeline-cron` — `data_quality_snapshots`, `customer_cohorts`, `catalog_snapshot`; **cron** com `Authorization: Bearer CRON_SECRET` (body opcional `{ "jobs": ["quality","cohorts","catalog"] }`) |
| Mercado Pago Dashboard → webhooks | `mercadopago-webhook` — assinatura `MERCADOPAGO_WEBHOOK_SECRET`; `verify_jwt = false` |
| `mercadopago-create-preference` | criação de preferência de checkout (JWT do usuário) |

Additional folders (webhooks, cron, SMS, WA, etc.) must be deployed if those features are enabled: e.g. `webhook-cart`, **`mercadopago-webhook`**, **`meta-whatsapp-webhook` (Meta Cloud)**, `integration-gateway`, `process-scheduled-messages`, `trigger-automations`, `flow-engine`, `send-sms`, `ai-agent`, `ai-copy`, `sync-funil-ga4`, `data-pipeline-cron`, and others present in the repo.

- **OAuth / integrações e-commerce:** definir `EDGE_INTERNAL_CALLBACK_SECRET` (valor forte, só servidor) nas Secrets do Supabase. O mesmo segredo é enviado no header `x-internal-secret` quando as funções `oauth-shopify`, `oauth-nuvemshop` e `oauth-woocommerce` chamam `post-integration-setup` e `register-webhooks` após o callback (sem JWT do browser). Sem esse secret, a integração ainda é persistida, mas o seed de jornadas e o registo automático de webhooks podem falhar em silêncio nos logs.

### Dados operacionais (funil GA4 + qualidade)

- **Migração:** `supabase/migrations/20260410140000_operational_data_blueprint.sql` — `funil_diario`, `data_quality_snapshots`, `v_orders_net_revenue`, colunas extras em `orders_v3`, `abandon_step`, etc.
- **Supabase Secrets:** definir `CRON_SECRET` (e demais secrets já listados em `npm run validate:env:edge`). `CRON_SECRET` aparece como recomendado no validador até todos os ambientes usarem cron.
- **Deploy das functions:** `npm run supabase:deploy:operational-data` ou `npx supabase functions deploy sync-funil-ga4 data-pipeline-cron` (e manter `integration-gateway`, `webhook-cart`, `calculate-rfm` atualizadas se o pipeline de pedidos mudou).
- **Aplicar só o SQL no remoto (sem resolver histórico de migrações):** `npm run supabase:sql:operational-blueprint` — executa o ficheiro da migração via `db query --linked` (idempotente na maior parte; use após rever o SQL).
- **`supabase/config.toml`:** `verify_jwt = false` para `sync-funil-ga4` e `data-pipeline-cron` (autenticação via `CRON_SECRET` no handler).
- **Agendamento:** no Dashboard Supabase (Scheduled Functions / pg\_cron) ou job externo: POST diário em `.../functions/v1/sync-funil-ga4` e `.../functions/v1/data-pipeline-cron` com header `Authorization: Bearer <CRON_SECRET>`.
- **Migrações remotas:** se `supabase db push --linked` avisar de ordem divergente, alinhar com `npm run supabase:migration-list` / `docs/supabase-migrations-sync.md` ou aplicar o SQL da migração manualmente no Editor quando apropriado.

**Beta UI scope (channel-poor environments):** Set `VITE_BETA_LIMITED_SCOPE=true` on the frontend build. This hides WhatsApp, Newsletter, Campanhas, Inbox, Automações, and Carrinho abandonado from the sidebar and redirects direct URLs to `/dashboard`. Routes under `/demo/*` ignore this flag.

### Build

Bundle is split into manual chunks in `vite.config.ts`: vendor-react, vendor-query, vendor-supabase, vendor-charts, vendor-forms.

🚀 PROMPT UNIFICADO — LTV BOOST + ConvertIQ
Plataforma completa de Retenção e Diagnóstico de Conversão para E-commerces

SaaS completo chamado LTV Boost — plataforma de inteligência de retenção para e-commerces brasileiros. O produto combina dois módulos principais:
Core LTV Boost — Campanhas automatizadas de WhatsApp, Email e SMS com segmentação RFM e IA para transformar base de clientes parada em receita recorrente
ConvertIQ — Módulo de diagnóstico inteligente de conversão com funil visual, análise via IA (Anthropic) e plano de ação priorizado


🗄️ BANCO DE DADOS — SUPABASE
Configure a integração com Supabase e crie todas as tabelas abaixo via SQL Editor:
-- Usuários / contas
create table lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  url text,
  plataforma text check (plataforma in
    ('Shopify','VTEX','WooCommerce','Nuvemshop','Tray','Yampi','Loja Integrada','Outro')),
  criado_em timestamptz default now()
);

-- Métricas do funil de conversão
create table metricas_funil (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id) on delete cascade,
  periodo text check (periodo in ('7d','30d','90d')),
  visitantes integer,
  produto_visto integer,
  carrinho integer,
  checkout integer,
  pedido integer,
  data_referencia date default current_date,
  fonte text default 'manual',
  criado_em timestamptz default now()
);

-- Configurações gerais e integrações
create table configuracoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id) on delete cascade,
  meta_conversao numeric(5,2) default 2.5,
  ticket_medio numeric(10,2) default 250.00,
  ga4_measurement_id text,
  ga4_property_id text,
  ga4_access_token text,
  meta_pixel_id text,
  shopify_token text,
  whatsapp_number text,
  whatsapp_token text,
  atualizado_em timestamptz default now()
);

-- Diagnósticos gerados pela IA
create table diagnosticos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id) on delete cascade,
  metricas_funil_id uuid references metricas_funil(id),
  diagnostico_json jsonb not null,
  modelo_ia text default 'claude-sonnet-4-20250514',
  criado_em timestamptz default now()
);

-- Campanhas de WhatsApp/Email/SMS
create table campanhas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references lojas(id) on delete cascade,
  nome text not null,
  objetivo text,
  canal text check (canal in ('whatsapp','email','sms','multicanal')),
  segmento text,
  status text check (status in ('rascunho','ativo','pausado','encerrado'))
    default 'rascunho',
  template_json jsonb,
  agendado_para timestamptz,
  enviados integer default 0,
  aberturas integer default 0,
  conversoes integer default 0,
  receita_gerada numeric(12,2) default 0,
  criado_em timestamptz default now()
);

Habilite Row Level Security (RLS) em todas as tabelas com políticas para usuários autenticados.

⚡ EDGE FUNCTIONS — SUPABASE
gerar-diagnostico
// supabase/functions/gerar-diagnostico/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const {
      visitantes, produto_visto, carrinho,
      checkout, pedido, ticket_medio, meta_conversao,
    } = await req.json();

    const p = (a: number, b: number) =>
      b > 0 ? ((a / b) * 100).toFixed(1) : "0";

    const taxa_produto   = p(produto_visto, visitantes);
    const taxa_carrinho  = p(carrinho, produto_visto);
    const taxa_checkout  = p(checkout, carrinho);
    const taxa_pedido    = p(pedido, checkout);
    const conversao      = p(pedido, visitantes);
    const perda          = Math.round(
      ((meta_conversao / 100) - (Number(conversao) / 100)) *
      visitantes * ticket_medio
    );

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");

    const system = `Você é especialista em CRO para ecommerce brasileiro.
Analise o funil e retorne APENAS este JSON (sem markdown, sem texto extra):
{
  "resumo": "2 frases em linguagem de lojista, sem jargão",
  "perda_principal": "onde está o maior gargalo",
  "percentual_explicado": <number>,
  "problemas": [
    {
      "titulo": "string",
      "descricao": "máx 2 frases com dado concreto",
      "severidade": "critico|alto|medio",
      "impacto_reais": <number>
    }
  ],
  "recomendacoes": [
    {
      "titulo": "string",
      "descricao": "o que fazer na prática",
      "esforco": "baixo|medio|alto",
      "impacto_pp": <number>,
      "prazo_semanas": <number>,
      "tipo": "quick_win|ab_test|medio_prazo"
    }
  ]
}`;

    const user = `Funil:
- Visitantes: ${visitantes}
- Produto visto: ${produto_visto} (${taxa_produto}%)
- Carrinho: ${carrinho} (${taxa_carrinho}%)
- Checkout: ${checkout} (${taxa_checkout}%)
- Pedido: ${pedido} (${taxa_pedido}%)
- Conversão geral: ${conversao}% | Meta: ${meta_conversao}%
- Ticket médio: R$ ${ticket_medio} | Perda estimada: R$ ${perda}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    const data = await r.json();
    const raw  = data.content[0].text.trim();

    let diagnostico;
    try { diagnostico = JSON.parse(raw); }
    catch { diagnostico = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); }

    return new Response(
      JSON.stringify({ success: true, diagnostico }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});

buscar-ga4
// supabase/functions/buscar-ga4/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { ga4_property_id, access_token, periodo = "30d" } = await req.json();
    const dias = ({ "7d": 7, "30d": 30, "90d": 90 } as Record<string,number>)[periodo] ?? 30;
    const startDate = `${dias}daysAgo`;
    const base = `https://analyticsdata.googleapis.com/v1beta/properties/${ga4_property_id}`;
    const headers = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };

    const [evR, seR] = await Promise.all([
      fetch(`${base}:runReport`, {
        method: "POST", headers,
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: "today" }],
          metrics: [{ name: "eventCount" }],
          dimensions: [{ name: "eventName" }],
        }),
      }),
      fetch(`${base}:runReport`, {
        method: "POST", headers,
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: "today" }],
          metrics: [{ name: "sessions" }],
        }),
      }),
    ]);

    const [evData, seData] = await Promise.all([evR.json(), seR.json()]);
    const ev: Record<string, number> = {};
    for (const row of evData.rows ?? [])
      ev[row.dimensionValues[0].value] = parseInt(row.metricValues[0].value);

    const visitantes = parseInt(seData.rows?.[0]?.metricValues?.[0]?.value ?? "0");

    return new Response(JSON.stringify({
      success: true,
      metricas: {
        visitantes,
        produto_visto: ev["view_item"]     ?? Math.round(visitantes * 0.72),
        carrinho:      ev["add_to_cart"]   ?? Math.round(visitantes * 0.28),
        checkout:      ev["begin_checkout"]?? Math.round(visitantes * 0.14),
        pedido:        ev["purchase"]      ?? Math.round(visitantes * 0.014),
        fonte: "ga4",
      },
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
});

Variáveis de ambiente obrigatórias (Supabase → Settings → Secrets):
ANTHROPIC_API_KEY = sk-ant-api03-...


📁 ESTRUTURA COMPLETA DE ROTAS
/                           → Landing Page
/onboarding                 → Cadastro + setup inicial da loja
/dashboard                  → Dashboard principal LTV Boost
/dashboard/campanhas        → Gestão de campanhas
/dashboard/jornadas         → Jornadas automáticas
/dashboard/segmentacao      → Mapa RFM + perfil de clientes
/dashboard/fidelidade       → Programa de fidelidade
/dashboard/inbox            → Caixa de entrada multicanal
/dashboard/relatorios       → Relatórios e analytics
/dashboard/integracoes      → Central de integrações
/dashboard/configuracoes    → Configurações da conta
/dashboard/convertiq        → Hub do módulo ConvertIQ
/dashboard/convertiq/setup  → Configuração inicial do ConvertIQ
/dashboard/convertiq/diagnostico → Diagnóstico gerado pela IA
/dashboard/convertiq/plano  → Plano de ação priorizado
/planos                     → Página de planos e preços


🖥️ TELAS — DETALHE COMPLETO
2. ONBOARDING (/onboarding)
Fluxo em 5 etapas com progress bar visual no topo.
Etapa 1 — Conta:
Nome completo, email, senha
OAuth: "Continuar com Google"
Etapa 2 — Sua loja:
Nome da loja (text)
Plataforma (select: Shopify, VTEX, WooCommerce, Nuvemshop, Tray, Yampi, Loja Integrada, Outro)
URL da loja (url input)
Meta de conversão % (number, default 2.5, tooltip com benchmark)
Ticket médio R$ (number, default 250)
Etapa 3 — Conectar loja:
Grid de plataformas com logo e botão "Conectar" (OAuth por plataforma)
Status visual: pendente → conectado (checkmark verde animado)
Etapa 4 — Conectar fontes de dados:
Card GA4: botão "Conectar" → modal com campos Property ID + Access Token + botão "Testar conexão"
Loading: "Testando conexão..." → sucesso: "✓ X visitantes encontrados" → botão "Salvar"
Card Meta Pixel: badge "Em breve" (desabilitado)
Card Shopify Admin: badge "Em breve" (desabilitado)
Opção de pular
Etapa 5 — WhatsApp:
Área de QR Code (placeholder visual)
Instrução passo-a-passo
Opção "Já tenho número verificado"
Botão "Pular por agora"
CTA final: "Acessar meu dashboard →" → salva tudo no Supabase e redireciona

3. DASHBOARD PRINCIPAL (/dashboard)
Sidebar esquerda (240px, fixa):
Logo LTV Boost

─── PRINCIPAL ───
📊  Dashboard
📣  Campanhas
🔄  Jornadas Automáticas
👥  Segmentação RFM
⭐  Fidelidade
💬  Inbox

─── ANALYTICS ───
📈  Relatórios

─── FERRAMENTAS ───
🔬  ConvertIQ          ← badge "⚠" se conversão abaixo da meta
🔌  Integrações
⚙️   Configurações

─── inferior ───
Plano atual + "Upgrade"
Avatar do usuário

Header top:
"Bom dia, [nome] 👋"
"Sua loja gerou R$ [X] via LTV Boost hoje" (verde neon)
KPI Cards (4 cards):
Receita Gerada — valor grande verde + variação % vs mês anterior
Clientes Reativados — número + sparkline azul
Campanhas Ativas — número + status
ROAS Médio — multiplicador (ex: 14.2x)
Gráfico Principal:
"Receita Recuperada — últimos 30 dias"
Line chart com área preenchida gradiente verde
Toggle: 7d / 30d / 90d
Painel "Oportunidades da IA" (3 cards âmbar):
"523 clientes inativos há 60+ dias → R$ 8.400 potencial" [Criar campanha]
"89 boletos vencidos → R$ 3.200 potencial" [Ativar]
"Sazonalidade detectada: ticket sobe 34% em [data]" [Ver análise]
Widget ConvertIQ (card compacto):
"Taxa de Conversão: 1.42%" | "▼ 1.08pp da meta"
Mini funil visual simplificado (barras de 5px de altura)
Botão "Ver diagnóstico completo →"
Jornadas Automáticas Ativas:
Cards pequenos com toggle ON/OFF + acionamentos do dia
Carrinho Abandonado | Boleto Vencido | Pós-compra | Reativação
Tabela de Campanhas Recentes:
Colunas: Nome | Status (badge) | Canal (ícone) | Enviados | Conversões | Receita | Ações

4. CAMPANHAS (/dashboard/campanhas)
Header: título + botão "+ Nova Campanha" + filtros de status + busca
Botão "+ Nova Campanha" → modal em 4 passos:
Passo 1 — Objetivo: Grid de cards clicáveis:
🛒 Recuperar carrinho abandonado
😴 Reativar clientes dormentes
💸 Recuperar boleto/PIX vencido
🎁 Promoção especial / Lançamento
🔄 Incentivo de recompra
⭐ Pedir avaliação
🎂 Aniversário do cliente
📦 Pós-entrega (cross-sell)
Passo 2 — Segmento:
Mapa RFM visual com segmentos destacáveis
Opções: Todos | Campeões | Fiéis | Em risco | Dormentes | Perdidos | Customizado
Preview: "Esta campanha vai atingir [X] clientes"
Passo 3 — Conteúdo (IA):
Selector de canal: WhatsApp | Email | SMS | Multicanal
Textarea: "Descreva o que quer comunicar..."
Botão "✨ Gerar com IA" → 3 variações do template
Preview em mockup de celular (WhatsApp nativo)
Edição manual de cada variação
Passo 4 — Agendamento:
Agora | Agendar (date/time picker) | Recorrente
Sugestão da IA: "Melhor horário baseado no seu histórico: Terça 10h (67% mais abertura)"
Estimativa: "R$ 3.200 a R$ 7.800 em 48h"
Botão "Revisar e Ativar →"
Lista de campanhas: Cards com: nome, status badge, canal (ícone), métricas, ações
Página de relatório por campanha:
Funil: Enviados → Entregues → Abertos → Clicados → Convertidos
Gráfico de conversões ao longo do tempo
Receita atribuída por produto
Comparativo A/B com winner destacado

5. JORNADAS AUTOMÁTICAS (/dashboard/jornadas)
Cards grandes, um por jornada:
Toggle ON/OFF em destaque
Métricas: acionamentos hoje / conversões / receita
Preview do fluxo (diagrama simplificado)
Botões: Editar | Relatório
6 jornadas pré-configuradas:
Carrinho Abandonado — 1h WhatsApp → 4h Email → 24h SMS com cupom
Boleto/PIX Vencido — 2h WhatsApp → 24h Email → 48h WhatsApp final
Pós-compra Cross-sell — 3 dias satisfação → 14 dias complementares
Reativação Dormentes — 60d Email → 70d WhatsApp → 90d oferta especial
Programa de Fidelidade — pontos + notificação a cada compra
Aniversário — 3 dias antes WhatsApp → dia do aniversário Email
Botão "Criar nova jornada":
Builder visual drag-and-drop simplificado
Nós: Gatilho | Condição | Aguardar | WhatsApp | Email | SMS | Tag | Fim

6. SEGMENTAÇÃO RFM (/dashboard/segmentacao)
Mapa RFM (destaque):
Grid 5x5 interativo tipo heatmap
Hover: tooltip com nome do segmento, nº clientes, ticket médio
Clique na célula: filtra tabela abaixo
Cards por segmento (8 cards): Campeões | Fiéis | Potenciais Fiéis | Novos | Promissores | Em Risco | Hibernando | Perdidos
Cada card: nº clientes, ticket médio, frequência, tendência, botão "Criar campanha"
Tabela de clientes:
Busca + filtros por segmento
Colunas: Nome | Email | Segmento (badge colorido) | Última compra | Total gasto | Risco churn (barra) | Ações
Clique na linha → sidebar com perfil completo

7. FIDELIDADE (/dashboard/fidelidade)
KPIs: clientes no programa | pontos em circulação | resgates no mês | receita impulsionada
Configuração do programa:
Nome do programa
Regras: R$ gasto → pontos (slider)
Bônus: avaliações, indicações, aniversário
Tiers: Bronze → Prata → Ouro → Diamante (pontos + benefícios por tier)
Recompensas: frete grátis, % desconto, produto grátis, cashback
Preview widget: mockup de como aparece na loja + preview de notificação WhatsApp

8. INBOX (/dashboard/inbox)
Layout 3 colunas:
Col 1 (300px): lista de conversas (Todas | Minhas | Não atribuídas | Resolvidas)
Col 2 (flex): conversa ativa em estilo WhatsApp nativo
Col 3 (300px): perfil do cliente + contexto
Área de conversa:
Input com formatação, emoji, anexo
Sugestões da IA (3 respostas) → clique para usar
Atalhos: enviar cupom | ver pedidos | escalar
Painel do cliente:
Segmento RFM atual, total gasto, histórico de pedidos
Campanha que originou a conversa, tags editáveis, notas internas

9. RELATÓRIOS (/dashboard/relatorios)
Tabs: Visão Geral | Campanhas | Canais | Clientes | Fidelidade
Gráficos:
Receita por canal (stacked bar)
Evolução do LTV médio
Taxa de retenção mensal (cohort)
Top campanhas por ROAS (horizontal bar)
Distribuição RFM (donut)
Heatmap de dias/horários de melhor conversão
Exportar: PDF com white-label (plano Scale)

10. INTEGRAÇÕES (/dashboard/integracoes)
Grid categorizado:
E-commerce: Shopify, VTEX, Nuvemshop, WooCommerce, Tray, Yampi, Loja Integrada Canais: WhatsApp Business API, SendGrid, Zenvia SMS Analytics: Google Analytics 4, Facebook Pixel CRM: RD Station, HubSpot Outros: Zapier, Make, Webhook customizado
Cada card: logo + nome + descrição + botão "Conectar" ou badge "Conectado ✓"

11. CONFIGURAÇÕES (/dashboard/configuracoes)
Tabs: Conta | Equipe | Cobrança | Notificações | API
Equipe: lista de membros + roles (Admin/Operador/Visualizador) + botão "Convidar" Cobrança: plano atual + histórico de faturas + créditos de mensagens (barra de uso) API: chave de API + documentação inline + logs de requests

12. CONVERTIQ — HUB (/dashboard/convertiq)
Acessado pelo menu lateral com ícone <BarChart3> (Lucide). Badge "⚠" no menu se conversão abaixo da meta.
Header:
Esquerda: ícone + "ConvertIQ" + badge com nome da loja
Direita:
  Toggle período: [7d] [30d] [90d]
  Botão "↻ Atualizar dados" + tooltip "Última atualização: [hora]"
  Botão "✨ Gerar diagnóstico com IA" (primário, gradient)

4 KPI Cards:
Conversão Atual: "1.42%" (JetBrains Mono grande) | "Meta: 2.50%" | badge "▼ 1.08pp abaixo"
Perda Estimada/mês: "R$ 58.400" (vermelho) | "vs. se atingisse a meta"
Visitantes: "12.400" + sparkline azul | "últimos 30 dias"
Maior Gargalo: "Checkout → Pedido" | "10% completam" | badge "Crítico" pulsante
Funil de Conversão (componente central):
Barras horizontais empilhadas verticalmente, proporcionais ao valor:
Visitantes      ████████████████████████████  12.400   —
Produto visto   █████████████████████          8.930   ▼ 28% saíram (amarelo)
Carrinho        █████████████                  3.472   ▼ 61% saíram (laranja)
Checkout        ██████                         1.736   ▼ 50% saíram (vermelho)
Pedido          █                                174   ▼ 90% saíram (vermelho pulsante ⚠ Gargalo)

Cada barra: label (esquerda) | barra colorida (azul → vermelho conforme queda) | valor (JetBrains Mono) | badge de drop
Box "🔍 Análise rápida" (gerada via JS, calculada automaticamente): "A maior queda está entre Checkout e Pedido (90% de abandono) — 3.2x pior que o benchmark do setor. Essa perda representa R$ 34.000/mês."
Seção "Último Diagnóstico" (se existir no Supabase):
Data, resumo (2 linhas), badges de problemas
Botão "Ver diagnóstico completo →"
Loading state ao clicar em "Gerar diagnóstico com IA":
Overlay escuro + card centralizado:
  ícone IA animado
  Steps sequenciais animados:
    ✓ Calculando taxas de conversão
    ✓ Identificando gargalos
    ⟳ Gerando recomendações personalizadas...
  Barra de progresso animada
  "~15 segundos"

Após retorno: toast "✨ Diagnóstico gerado!" → redireciona para /dashboard/convertiq/diagnostico
Modal "Editar dados manualmente" (botão secundário no header):
Período: select (7d/30d/90d)
Campos em grid:
  Visitantes únicos | Visualizações de produto
  Adições ao carrinho | Inícios de checkout
  Pedidos finalizados | Ticket médio (R$)
Botão "Salvar métricas" → Supabase + recalcula KPIs


13. CONVERTIQ — DIAGNÓSTICO (/dashboard/convertiq/diagnostico)
Header:
"← Voltar" | título "Diagnóstico de Conversão" | data/hora | badge "Powered by Claude AI"
Card de Resumo da IA (destaque):
Borda esquerda 4px verde neon, ícone sparkles
Label "Análise da Inteligência Artificial"
Texto resumo do JSON (Syne 18px, branco, line-height 1.6)
Separador
"Principal gargalo: [perda_principal]" + badge "[X]% das perdas explicadas"
3 Cards de Problemas (do JSON problemas[]):
Severidade com cores:
critico → badge vermelho pulsante #EF4444
alto → badge laranja #F97316
medio → badge amarelo #EAB308
Cada card: badge severidade | título (Syne bold) | descrição (DM Sans 14px) | "Impacto: R$ XX.XXX/mês" (vermelho, JetBrains Mono)
Fallback mock (quando não há diagnóstico da IA):
Card 1 CRÍTICO: "Frete revelado tarde no checkout" — R$ 34.000/mês
Card 2 ALTO: "Imagens de produto insuficientes" — R$ 14.200/mês
Card 3 MÉDIO: "Formulário de checkout com 14 campos" — R$ 8.600/mês
Botão "Ver plano de ação →" (full-width, gradient)
Histórico de Diagnósticos (últimos 3):
Lista: data | conversão do momento | nº problemas | botão "Ver"
Empty state: ícone + "Nenhum diagnóstico anterior. Gere o primeiro!"

14. CONVERTIQ — PLANO DE AÇÃO (/dashboard/convertiq/plano)
Header:
"← Voltar" | "Plano de Ação"
Destaque: "Potencial total: +1.87pp de conversão = R$ 56.800/mês adicionais"
Matriz visual 2x2 (Esforço × Impacto):
Mini scatter plot com 3 pontos numerados
Quadrante sup-esquerdo: fundo verde sutil + label "Faça agora"
3 Cards de Recomendação (do JSON recomendacoes[]):
Badges de tipo:
quick_win → "⚡ Quick Win" (verde)
ab_test → "🧪 A/B Test" (azul)
medio_prazo → "📅 Médio Prazo" (âmbar)
Cada card:
Número (#1, #2, #3) em círculo colorido + badge tipo + badge esforço
Título (Syne bold) + descrição (o que fazer na prática)
Grid 2 colunas: "+X.Xpp conversão" (verde) | "X semanas" (branco)
Barra de progresso do impacto proporcional
Fallback mock:
#1 ⚡ Quick Win: "Mostrar frete grátis a partir de R$ X" — +0.82pp — 1 semana
#2 🧪 A/B Test: "Checkout em 1 página com 7 campos" — +0.65pp — 3 semanas
#3 📅 Médio Prazo: "Fotos profissionais nos top 50 produtos" — +0.40pp — 6 semanas
CTA final:
"Quer recuperar clientes enquanto trabalha nessas melhorias?"
Botão: "Ver campanhas de reativação →" → /dashboard/campanhas

15. PLANOS (/planos)
Toggle anual/mensal + badge "2 meses grátis" no anual
3 planos:
STARTER — R$ 197/mês
Borda cinza
Até 5.000 clientes, 3.000 msgs/mês WhatsApp, 5 jornadas automáticas, segmentação RFM, biblioteca de campanhas, 1 usuário, ConvertIQ (dados manuais)
CTA: "Começar grátis"
GROWTH — R$ 497/mês
Borda azul, badge "Mais Popular", card destacado
Tudo do Starter + até 25.000 clientes, 15.000 msgs/mês, IA Copywriter, Email + SMS, predição de churn, 5 usuários, ConvertIQ com GA4, suporte prioritário
CTA: "Começar grátis"
SCALE — R$ 997/mês
Borda verde neon com glow
Tudo do Growth + clientes ilimitados, 50.000 msgs/mês, Fidelidade completo, white-label, API, CSM dedicado, usuários ilimitados
CTA: "Falar com especialista"
Tabela comparativa completa abaixo dos cards.

🔔 COMPONENTES REUTILIZÁVEIS
MetricCard: label | valor (JetBrains Mono 32px) | variação (% + seta + cor) | sparkline opcional
FunnelBar: label | barra proporcional colorida (azul→vermelho) | valor | badge de drop rate
OpportunityCard: fundo âmbar translúcido | ícone raio | título | valor potencial verde | botão ação
SeverityBadge: crítico (vermelho pulsante) | alto (laranja) | médio (amarelo)
ChannelIcon: WhatsApp #25D366 | Email #3B82F6 | SMS #F59E0B
RFMBadge: Campeões (verde) | Fiéis (azul) | Em risco (amarelo) | Perdidos (vermelho) | Dormentes (cinza)
AILoadingOverlay: overlay escuro + card com steps animados sequencialmente + barra de progresso
QuickWinBanner: banner dispensável no topo: "💡 X oportunidades de receita esperando. Ver →"

📊 DADOS MOCK (usar em todas as telas como fallback)
const mockMetricas = {
  visitantes: 12400, produto_visto: 8930,
  carrinho: 3472, checkout: 1736, pedido: 174,
  fonte: 'mockado'
};

const mockConfig = {
  meta_conversao: 2.5, ticket_medio: 250,
  nome_loja: "Minha Loja", plataforma: "Shopify"
};

const mockCampanhas = [
  { nome: "Reativação Black Friday", status: "ativo", canal: "whatsapp",
    enviados: 1847, conversoes: 312, receita: 23450 },
  { nome: "Carrinho Abandonado — Eletrônicos", status: "ativo", canal: "multicanal",
    enviados: 934, conversoes: 187, receita: 14200 },
  { nome: "Boleto Vencido — Campanha Junho", status: "encerrado", canal: "sms",
    enviados: 423, conversoes: 89, receita: 6700 },
];

const mockDiagnostico = {
  resumo: "Identifiquei 3 gargalos críticos que explicam 78% da sua perda de conversão. O maior problema está no checkout: apenas 10% dos clientes que chegam lá finalizam a compra.",
  perda_principal: "Abandono entre Checkout e Pedido",
  percentual_explicado: 78,
  problemas: [
    { titulo: "Frete revelado apenas no checkout", descricao: "73% dos abandonos de checkout ocorrem ao ver o custo do frete pela primeira vez. Mostrar o frete na página do produto reduz esse abandono em até 42%.", severidade: "critico", impacto_reais: 34000 },
    { titulo: "Imagens de produto insuficientes", descricao: "Páginas com apenas 1-2 fotos convertem 3x menos que páginas com 6+ ângulos. 34% das suas páginas têm menos de 3 imagens.", severidade: "alto", impacto_reais: 14200 },
    { titulo: "Formulário de checkout com 14 campos", descricao: "O benchmark do setor é 7 campos. Cada campo extra reduz a conversão em ~3.4%. Remover os opcionais pode recuperar 0.8pp.", severidade: "medio", impacto_reais: 8600 }
  ],
  recomendacoes: [
    { titulo: "Mostrar frete grátis a partir de R$ 199 na página do produto", descricao: "Adicione banner dinâmico em todas as páginas de produto. Configure no painel da sua plataforma sem código.", esforco: "baixo", impacto_pp: 0.82, prazo_semanas: 1, tipo: "quick_win" },
    { titulo: "Checkout em 1 página com campos reduzidos", descricao: "Reduza de 14 para 7 campos. Teste por 2 semanas antes de aplicar globalmente.", esforco: "medio", impacto_pp: 0.65, prazo_semanas: 3, tipo: "ab_test" },
    { titulo: "Fotos profissionais para os top 50 produtos", descricao: "Invista em ensaio fotográfico com 8+ ângulos, vídeo 360° e fotos de lifestyle.", esforco: "alto", impacto_pp: 0.40, prazo_semanas: 6, tipo: "medio_prazo" }
  ]
};

Badge discreto quando usando mock: 📊 Dados demonstrativos no canto do funil/dashboard.

🔧 DETALHES TÉCNICOS
Stack:
React + TypeScript
TailwindCSS + shadcn/ui (customizado para dark theme)
Recharts (todos os gráficos)
Lucide React (ícones)
Supabase JS Client (banco + edge functions)
React Router (navegação)
Toast notifications:
toast.success("✅ Dados atualizados com sucesso");
toast.success("✨ Diagnóstico gerado! Analisando resultados...");
toast.error("❌ Erro ao conectar com GA4. Verifique seu Access Token.");
toast.loading("⟳ Buscando dados do Google Analytics 4...");
toast.info("📊 Usando dados demonstrativos. Configure GA4 para dados reais.");

Responsividade:
Desktop: sidebar 240px expandida
Tablet: sidebar colapsada (60px, só ícones)
Mobile: sidebar oculta com hamburger + overlay
Estados obrigatórios em todas as telas:
Loading: skeleton animado
Empty state: ícone + mensagem + CTA
Error state: mensagem amigável + botão de retry
Success: toast + atualização visual imediata
Variáveis de ambiente:
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...
# No Supabase → Settings → Secrets:
ANTHROPIC_API_KEY=sk-ant-api03-xxx...


Construa todas as telas com dados mockados realistas. Nenhuma tela deve aparecer vazia. O produto deve parecer real e em uso desde o primeiro acesso.

