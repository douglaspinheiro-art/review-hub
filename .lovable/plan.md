

# Plano: Preparação para Validação com 10 E-commerces Reais

## Contexto

A plataforma está com build estável, RLS hardened, e secrets configurados. Agora precisa garantir que o fluxo completo funciona end-to-end para usuários reais.

## Problema Atual: Runtime Error

Há um erro `Component is not a function` na rota `/planos` que precisa ser corrigido antes de qualquer usuário real acessar. Provavelmente relacionado ao lazy import do `Calculadora` — o componente exporta `CalculadoraPage` mas é importado como default sem destructuring.

---

## Bloco 1 — Fix do Runtime Error (URGENTE)

Investigar e corrigir o `TypeError: Component is not a function` na página `/planos`. O lazy import `const CalculadoraSimulador = lazy(() => import("./Calculadora"))` pode estar falhando em certas condições de carregamento.

---

## Bloco 2 — Checklist de Validação por Fluxo

Criar uma página interna `/admin/validacao` (protegida por role `admin`) que permite:

1. **Testar cada fluxo crítico** com status visual:
   - Signup → Profile + Store criados
   - Onboarding → Integration credentials saved
   - WhatsApp Setup → Meta Embedded Signup → connection row
   - Primeira campanha → dispatch → delivery
   - Inbox → receber mensagem inbound → responder

2. **Health check das Edge Functions** — botão que chama cada function com payload de teste e mostra status/latência

3. **Monitor de dados por loja** — ver se stores, contacts, campaigns existem para cada usuário piloto

---

## Bloco 3 — Onboarding Simplificado para Pilotos

O onboarding atual exige API keys manuais. Para os 10 pilotos:

1. Adicionar um **fluxo de convite** — link `/signup?ref=pilot` que pré-configura trial de 30 dias e marca `profiles.tags = ['pilot']`
2. Criar **guia contextual inline** no Step 2 do onboarding com screenshots de onde encontrar as credenciais em cada plataforma (Shopify, Nuvemshop, etc.)
3. Adicionar **validação em tempo real** das credenciais no onboarding (já existe `validate-integration` — garantir que funciona para todas as plataformas)

---

## Bloco 4 — Observabilidade Mínima

Para acompanhar os 10 pilotos em tempo real:

1. **Dashboard Admin** (`/admin`) — adicionar aba "Pilotos" com:
   - Lista de usuários com status (signup, onboarding, ativo, churned)
   - Contagem de contacts, campaigns, messages por loja
   - Último login e última ação
   - Erros recentes do `client_error_events`

2. **Alertas básicos** — Edge Function `enviar-pulse-semanal` já existe; ajustar para enviar alerta quando:
   - Piloto não logou em 3+ dias
   - Integration quebrou (sync_status = 'error')
   - Campanha falhou (status = 'failed')

---

## Bloco 5 — Hardening do Fluxo Crítico

1. **Retry no WhatsApp send** — adicionar retry com backoff no `meta-whatsapp-send` (hoje falha silenciosamente)
2. **Dead-letter queue** — `scheduled_messages` com status `failed` precisam de um mecanismo de retry visível no dashboard
3. **Rate limit feedback** — quando Meta API retorna 429, mostrar toast ao usuário com tempo de espera

---

## Bloco 6 — Seed Data para Demo

Para que os pilotos vejam valor imediato ao entrar:

1. **Primeiro diagnóstico automático** — após onboarding, chamar `gerar-diagnostico` automaticamente com dados mockados da plataforma do piloto
2. **Contatos de exemplo** — inserir 5 contatos demo com RFM já calculado para que o mapa RFM não fique vazio

---

## Resumo de Execução

| Bloco | Tipo | Prioridade | Esforço |
|---|---|---|---|
| 1. Fix runtime error `/planos` | Code fix | P0 | 15 min |
| 2. Página de validação admin | Nova feature | P1 | 45 min |
| 3. Onboarding pilot flow | Code edit | P1 | 30 min |
| 4. Dashboard admin pilotos | Nova feature | P1 | 40 min |
| 5. Retry/dead-letter WhatsApp | Edge Function | P2 | 30 min |
| 6. Seed data automático | Code edit | P2 | 20 min |

**Total estimado:** ~3h de implementação

### Ordem recomendada:
1. Fix runtime error (bloqueia tudo)
2. Onboarding pilot flow (primeira coisa que pilotos veem)
3. Dashboard admin pilotos (você precisa monitorar)
4. Página de validação (seu checklist interno)
5. Seed data (melhora first impression)
6. Retry WhatsApp (resiliência)

