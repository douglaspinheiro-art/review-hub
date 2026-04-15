# 🚀 Playbook LTV Boost

Bem-vindo ao guia oficial do **LTV Boost**, a plataforma definitiva de automação de marketing via WhatsApp para e-commerces brasileiros. Este documento serve como bússola para usuários, desenvolvedores e gestores de tráfego que buscam extrair o máximo potencial de retenção e recompra.

---

## 📋 Sumário
1. [Visão Geral](#visão-geral)
2. [Arquitetura e Stack](#arquitetura-e-stack)
3. [System Design](#system-design)
4. [Design System](#design-system)
5. [Jornada de Onboarding](#jornada-de-onboarding)
6. [Módulos Principais](#módulos-principais)
7. [Estratégias de LTV](#estratégias-de-ltv)
8. [Configurações Técnicas](#configurações-técnicas)
9. [Suporte e Manutenção](#suporte-e-manutenção)

---

## 🎯 Visão Geral
... (rest of the section)

## 🏗️ Arquitetura e Stack
A plataforma foi construída com tecnologias de ponta para garantir velocidade e escala:
- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS.
- **Componentes:** shadcn/ui + Framer Motion.
- **Backend/Banco:** Supabase (PostgreSQL, Auth, Edge Functions).
- **Conectividade WhatsApp:** Meta Cloud API (API oficial).
- **Gerenciamento de Estado:** TanStack Query v5.

---

## ⚙️ System Design
O LTV Boost opera em um ecossistema de microsserviços e funções serverless, desenhado para alta disponibilidade e baixa latência:

### 1. Ingestão de Dados (Ingress)
- **Integration Gateway:** Função central que recebe webhooks de plataformas de e-commerce (Shopify, Nuvemshop, etc).
- **Webhook Cart:** Processa especificamente eventos de abandono de carrinho em tempo real.
- **Sincronização:** Jobs agendados para sincronizar canais e buscar dados históricos (GA4, APIs de Marketplaces).

### 2. Processamento e Inteligência (Core)
- **Flow Engine:** O coração da automação. Decide qual mensagem enviar e em qual momento, baseado no comportamento do usuário.
- **Agente IA (ConvertIQ):** Utiliza LLMs para gerar diagnósticos, sugerir cópias de mensagens (ai-copy) e prescrever ações de recuperação.
- **RFM Engine:** Processa o banco de dados PostgreSQL para segmentar clientes em tempo real (Recência, Frequência, Valor).

### 3. Execução de Mensagens (Egress)
- **Meta Cloud API:** Camada de envio oficial via API da Meta, garantindo entrega confiável e conformidade com políticas do WhatsApp Business.
- **Dispatch Campaign:** Gerencia o envio em massa de campanhas segmentadas, respeitando limites de taxa (rate limiting) para evitar bloqueios.

### 4. Ciclo de Feedback
- **Pulse Semanal:** Gera relatórios automáticos de performance e envia via WhatsApp/E-mail para os lojistas.
- **Feedback Loop:** As respostas dos clientes no WhatsApp alimentam novamente a IA para otimizar futuras abordagens.

---

## 🎨 Design System
A identidade visual do LTV Boost foi projetada para transmitir confiança, eficiência tecnológica e crescimento.

### 1. Paleta de Cores
- **Primária (Emerald Green):** `hsl(160 84% 45%)` no modo dark / `hsl(160 84% 30%)` no modo light. Representa lucro, saúde financeira e vitalidade.
- **Background:** Dark mode utiliza um tom profundo de azul/cinza (`hsl(220 40% 4%)`) para reduzir o cansaço visual e destacar os KPIs.
- **Accents:** Tons de Amber (Alertas/Oportunidades) e Blue (Informação/Sincronização).

### 2. Tipografia
- **Títulos (Display):** `Syne`. Uma fonte moderna e geométrica usada em títulos de seções e onboarding para uma estética "tech-forward".
- **Corpo e Interface:** `Inter`. Focada em legibilidade extrema para dados densos e tabelas.
- **Dados:** `JetBrains Mono` ou fontes mono-espaçadas para IDs de pedidos e logs técnicos.

### 3. Componentes e UI
- **Base:** Baseado inteiramente em `shadcn/ui` (Radix UI + Tailwind).
- **Ícones:** `lucide-react`. Traços finos e consistentes.
- **Estilo Visual:** 
    - **Glassmorphism:** Uso moderado de backgrounds semi-transparentes com blur (`glass` class).
    - **Gradients:** Gradientes sutis de Emerald para destacar botões de ação principal (CTA).
    - **Bordas:** Arredondamento padrão de `0.75rem` (12px) para um visual moderno e amigável.

### 4. Princípios de Interface
- **Mobile First:** Toda a dashboard é responsiva, permitindo que o lojista acompanhe a recuperação de pedidos pelo celular.
- **Feedback Imediato:** Uso de Toasts (Sonner) e Skeletons para estados de carregamento.
- **Micro-interações:** Framer Motion para transições suaves entre abas e modais.

---

## 🚀 Jornada de Onboarding
O sucesso no LTV Boost começa com uma configuração correta em 3 passos:

1.  **Conexão de Canais:** Integre sua loja (Shopify, VTEX, Nuvemshop, WooCommerce) via Webhook ou API.
2.  **Motor de Recuperação:** Conecte seu WhatsApp Business via Meta Embedded Signup (login com Facebook).
3.  **Primeira Prescrição:** A IA analisa seus dados históricos e sugere a primeira campanha de alto impacto (ex: recuperar boletos expirados dos últimos 7 dias).

---

## 🛠️ Módulos Principais

### 1. Dashboard & Analytics
Visão em tempo real do ROI, taxa de recuperação e saúde do LTV.
- **CHS Gauge:** Monitora a "Customer Health Score".
- **Forecast:** Previsão de faturamento baseado no comportamento de recompra.

### 2. WhatsApp & Inbox
- **Canais:** Gerenciamento de múltiplas instâncias do WhatsApp.
- **Unified Inbox:** Atendimento centralizado para todas as conversas geradas pelas automações.

### 3. Campanhas & Automações
- **Campanhas Ativas:** Disparos segmentados para datas sazonais.
- **Réguas Automáticas:** 
    - **Carrinho Abandonado:** Fluxo de 3 mensagens cronometradas.
    - **Boletos e PIX:** Lembretes de vencimento amigáveis.
    - **Pós-venda e NPS:** Coleta de feedback automática pós-entrega.
    - **Win-back:** Reativação de clientes inativos há 60+ dias com ofertas exclusivas.

### 4. RFM & Segmentação
Análise automática de:
- **R**ecência: Quando comprou pela última vez?
- **F**requência: Quantas vezes já comprou?
- **M**onetário: Quanto já gastou no total?

### 5. Agente IA (ConvertIQ)
Diagnóstico profundo que identifica gargalos no funil e prescreve ações corretivas automáticas.

---

## 💡 Estratégias de LTV (Quick Wins)
Para resultados imediatos, implemente estas 3 estratégias:
1.  **O "Lembrete de Reposição":** Configure uma automação baseada no tempo médio de consumo do seu produto (ex: 30 dias para cosméticos).
2.  **Cashback no WhatsApp:** Envie um cupom exclusivo 24h após a entrega do pedido.
3.  **Recuperação de Boleto Personalizada:** Em vez de "pague seu boleto", use "vimos que você escolheu o [Produto X], quer que eu gere um novo código PIX para você?".

---

## ⚙️ Configurações Técnicas

### Integração via Webhook
Para plataformas sem integração nativa, utilize o nosso **Integration Gateway**:
`https://[SUPABASE_URL]/functions/v1/integration-gateway?platform=generic&loja_id=[ID]`

### WhatsApp (Meta Cloud API)
A plataforma utiliza a API oficial da Meta. Conecte sua conta via **Embedded Signup** em **Configurações > WhatsApp**.

---

## 🆘 Suporte e Manutenção
- **Status da API:** `/status`
- **Documentação Técnica:** `/docs`
- **Logs de Erro:** Verifique a aba **Relatórios > Logs de Automação**.

---
*LTV Boost - Transformando dados em lucro recorrente.*
