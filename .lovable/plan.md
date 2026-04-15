

# Reestruturação do Fluxo: Diagnóstico Antes do Onboarding

## Problema Atual

O fluxo atual é:
```text
Homepage → Signup → Analisando (fake loading) → Resultado (mock data) → Onboarding → Dashboard
```

**Problemas identificados:**
1. O `/analisando` espera um INSERT em `diagnosticos_v3` via realtime, mas nada realmente insere — o diagnóstico usa dados mock
2. O `/resultado` exibe dados 100% mockados (hardcoded), sem nenhuma informação real do lojista
3. O signup pede apenas nome, email, senha e plataforma — sem dados suficientes para um diagnóstico real
4. A tela de "Analisando" finge processar por 15s e depois faz fallback — não agrega valor
5. O onboarding (passo 1) pede objetivos e vertical, que poderiam alimentar o diagnóstico

## Novo Fluxo Proposto

```text
Homepage → Signup (simplificado) → Onboarding Diagnóstico (3 passos) → Analisando (real) → Resultado (real) → Setup (WhatsApp + integrações) → Dashboard
```

### Passo a passo:

**1. Signup** — mantém como está (nome, email, senha, plataforma)

**2. Novo Onboarding-Diagnóstico** (`/onboarding`) — 3 passos que coletam dados para o diagnóstico:
- **Passo 1**: Nome da loja, vertical/segmento, URL (reaproveita campos do Diagnostico.tsx atual)
- **Passo 2**: Dados do funil — faturamento mensal, nº clientes, ticket médio, taxa de abandono, canais ativos (sliders e inputs como já existe em `/diagnostico`)
- **Passo 3**: Conexão opcional GA4 para dados reais (com opção "Pular — usar estimativas")

**3. Analisando** (`/analisando`) — agora chama a Edge Function `gerar-diagnostico` com os dados reais coletados e escuta o INSERT real em `diagnosticos_v3`

**4. Resultado** (`/resultado`) — exibe o diagnóstico REAL da IA (não mais mock), com CHS calculado, problemas e prescrições personalizadas

**5. Novo Setup** (`/setup`) — conexão WhatsApp (Embedded Signup) + escolha de plano (que hoje está no Resultado). Botão final "Ir para o dashboard"

### Alterações por arquivo:

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Signup.tsx` | Redirecionar para `/onboarding` após signup (em vez de `/analisando`) |
| `src/pages/Onboarding.tsx` | Reescrever: 3 passos focados em coleta de dados do negócio (vertical, faturamento, funil, GA4 opcional). Salva dados em `stores` e `funnel_metrics`. Ao finalizar, chama `gerar-diagnostico` e redireciona para `/analisando` |
| `src/pages/Analisando.tsx` | Ajustar: agora o diagnóstico é real (a Edge Function é chamada pelo onboarding). Manter o listener realtime em `diagnosticos_v3` |
| `src/pages/Resultado.tsx` | Reescrever: buscar último diagnóstico do Supabase (`diagnosticos_v3`) em vez de usar mock. Exibir CHS, problemas e recomendações reais. CTA leva para `/setup` |
| `src/pages/Setup.tsx` (novo) | Extrair do onboarding antigo: conexão WhatsApp (Embedded Signup com guia) + escolha de plano + "Ir para o dashboard" |
| `src/App.tsx` | Adicionar rota `/setup` protegida |

### Dados coletados no novo onboarding e para onde vão:

- **Nome da loja, vertical, URL, plataforma** → tabela `stores` (update)
- **Faturamento, ticket médio, nº clientes** → usado para calcular funil estimado
- **Dados do funil (visitantes, carrinho, checkout, pedidos)** → tabela `funnel_metrics` + enviado para `gerar-diagnostico`
- **GA4 Property ID** → tabela `stores` (ga4_property_id)

### O que NÃO muda:
- Edge Function `gerar-diagnostico` — já está pronta
- Tabelas do banco — já existem (`stores`, `funnel_metrics`, `diagnostics_v3`)
- Componente `CHSGauge` — reutilizado no Resultado
- Fluxo de login direto → dashboard (usuários existentes)

## Benefícios
- Lojista vê um diagnóstico **real e personalizado** antes de qualquer configuração técnica
- O "wow moment" acontece mais cedo — dados reais geram mais confiança
- Conexão WhatsApp fica depois, quando o lojista já está convencido do valor
- Elimina dados mock no fluxo principal de conversão

