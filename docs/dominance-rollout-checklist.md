# Dominance Rollout Checklist

Guia de execucao para transformar o plano de dominancia em entregas semanais com metas mensuraveis.

## North-star e guardrails

- North-star: margem incremental recuperada por cliente ativo/mes.
- Ativacao: tempo para primeiro resultado financeiro (`TTV`) <= 7 dias.
- Retencao de uso: `WAU de gestores` e stickiness (`WAU/MAU`).
- Receita: `NRR` e expansao de ARPA via add-ons de inteligencia.
- Moat: uso de recomendacoes automaticas e cobertura do Retention Graph.

## Sprint 1 (Semana 1-2): Posicionamento e ativacao

### Entregas
- [ ] Atualizar copy principal para "lucro incremental" em landing e pricing.
- [ ] Exibir provas por vertical (moda, beleza, suplementos, pet).
- [ ] Capturar objetivo + vertical no onboarding e persistir perfil.
- [ ] Personalizar playbooks iniciais por objetivo.
- [ ] Instrumentar eventos de ativacao: `onboarding_completed`, `objective_selected`, `playbook_applied`.

### Metas
- [ ] `TTV <= 7 dias` para >= 60% dos novos clientes.
- [ ] Conversao onboarding passo 1->3 >= 55%.
- [ ] Primeiro playbook ativado em 24h por >= 45% das contas novas.

## Sprint 2 (Semana 3-4): Painel executivo e dependencia diaria

### Entregas
- [ ] Publicar painel executivo com oportunidade diaria e potencial financeiro.
- [ ] Mostrar "melhor proxima acao" com score e confianca.
- [ ] Implementar ritual semanal (resumo automatizado via WhatsApp/e-mail).
- [ ] Criar alerta de perda: "valor em risco hoje".
- [ ] Adicionar meta semanal de execucao para gestor.

### Metas
- [ ] `WAU gestor` >= 50% da base ativa.
- [ ] Stickiness `WAU/MAU` >= 0.45.
- [ ] >= 40% das contas com pelo menos 1 recomendacao executada/semana.

## Sprint 3 (Semana 5-6): Moat de dados e IA

### Entregas
- [ ] Consolidar Retention Graph por conta (recuperar/recomprar/reativar).
- [ ] Versionar score de propensao por jornada.
- [ ] Exibir evolucao do score por coorte.
- [ ] Criar benchmark anonimizado por cluster (vertical + faixa de faturamento).
- [ ] Registrar precisao do modelo (`predicted_vs_actual`) por janela.

### Metas
- [ ] Cobertura do Retention Graph >= 80% das contas ativas.
- [ ] Aderencia de recomendacao (aceitas/exibidas) >= 35%.
- [ ] Precisao de propensao (top band) >= 65% em 30 dias.

## Sprint 4 (Semana 7-8): Distribuicao e loop de crescimento

### Entregas
- [ ] Relatorio compartilhavel com link publico e branding.
- [ ] Programa de indicacao com codigo + incentivo em creditos.
- [ ] CTA de compartilhamento nos pontos de pico de valor (milestone/report).
- [ ] Assets prontos para social proof por vertical.
- [ ] Dashboard de performance do loop (shares, invites, converts).

### Metas
- [ ] `K-factor B2B` inicial >= 0.15.
- [ ] >= 20% dos gestores compartilhando 1 relatorio/mes.
- [ ] >= 10% de novos trials vindos de referral/relatorio compartilhado.

## Sprint 5 (Semana 9-10): Monetizacao e expansao de LTV

### Entregas
- [ ] Packaging por maturidade (Starter, Operator, Scale/Enterprise).
- [ ] Add-ons de inteligencia (benchmark preditivo, autopilot, multi-loja).
- [ ] Regras de upsell por evento de valor (ROI, volume, uso avancado).
- [ ] Tela de "valor capturado" para justificar upgrade.
- [ ] Monitor de risco de downgrade/churn por queda de uso.

### Metas
- [ ] `NRR >= 105%` no corte trimestral.
- [ ] Receita de add-ons >= 12% do MRR novo.
- [ ] Churn logo (60 dias) <= 8%.

## Cadencia operacional (semanal)

- Segunda: revisar funil de ativacao e contas em risco (`TTV`, onboarding drop-offs).
- Quarta: revisar recomendacoes e ganhos incrementais por jornada.
- Sexta: revisar distribuicao (`shares`, referrals, trials`) e experimentos da semana.
- Mensal: recalibrar score de propensao e benchmark por vertical.

## Dashboard de metricas obrigatorias

- [ ] Ativacao: `signup -> onboarding completo -> primeiro playbook -> primeira receita`.
- [ ] Uso: `WAU`, `WAU/MAU`, sessoes por gestor, tempo em dashboard.
- [ ] Valor: receita incremental, margem incremental, payback por conta.
- [ ] Receita SaaS: MRR, ARPA, expansion MRR, NRR, churn bruto e liquido.
- [ ] Moat: cobertura Retention Graph, uso de recomendacoes, precisao de propensao.

## Criterio de "dominancia no trilho" (90 dias)

Considerar que o plano entrou em trilho quando todos os criterios abaixo forem verdadeiros:

- [ ] `TTV <= 7 dias` sustentado por 4 semanas.
- [ ] `WAU gestor >= 55%` e `WAU/MAU >= 0.5`.
- [ ] `NRR >= 105%`.
- [ ] >= 50% das contas ativas executando recomendacoes semanalmente.
- [ ] Canal de referral + compartilhamento contribuindo com >= 15% dos novos trials.
