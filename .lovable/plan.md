

# Análise: Integração WhatsApp — Evolution API vs Meta API Oficial

## Resposta Direta

**A plataforma NÃO usa a API oficial do Meta para WhatsApp.** Ela usa a **Evolution API**, que é um wrapper open-source baseado no **Baileys** (biblioteca não-oficial que conecta via WhatsApp Web/QR Code).

## O que está implementado

| Componente | Tecnologia | Status |
|---|---|---|
| `src/lib/evolution-api.ts` | Evolution API (Baileys) | Funcional |
| `src/pages/dashboard/WhatsApp.tsx` | Gerenciamento de instâncias via QR Code | Funcional |
| `src/hooks/useWhatsAppSender.ts` | Envio de mensagens via Evolution API | Funcional |
| `supabase/functions/whatsapp-webhook/index.ts` | Recebe eventos da Evolution API | Funcional |
| `supabase/functions/whatsapp-health-check/index.ts` | Monitora conexões | Funcional |

## Diferenças Críticas

```text
Evolution API (atual)              Meta Cloud API (oficial)
─────────────────────              ──────────────────────
Conexão via QR Code                Conta Business verificada
Baileys (não-oficial)              API oficial do Meta
Sem custo de API                   Custo por conversa (Meta pricing)
Risco de ban do número             Sem risco de ban
Sem SLA / sem suporte              SLA do Meta
Funciona para testes/MVP           Obrigatório para produção em escala
```

## Riscos de usar Evolution API em produção

1. **Ban de número** — Meta pode banir números que usam clientes não-oficiais (Baileys). Isso pode acontecer a qualquer momento, sem aviso.
2. **Sem garantia de entrega** — Não há SLA, delivery receipts oficiais, nem suporte do Meta.
3. **Instabilidade** — A conexão depende de manter uma sessão web ativa; desconexões frequentes.
4. **Violação dos Termos de Serviço do WhatsApp** — Usar Baileys viola os ToS do WhatsApp/Meta.
5. **Escalabilidade limitada** — Para tráfego pago real com milhares de mensagens, a Evolution API não é confiável.

## O que seria necessário para usar a API oficial do Meta

Para migrar para a **WhatsApp Business Cloud API** (oficial), seria necessário:

1. **Conta Meta Business** verificada + número de telefone aprovado
2. **Criar um App no Meta Developers** com o produto "WhatsApp" ativado
3. **Obter credenciais**: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`
4. **Substituir `evolution-api.ts`** por um client que chame `https://graph.facebook.com/v21.0/{phone_number_id}/messages`
5. **Templates aprovados** — Meta exige que mensagens proativas usem templates pré-aprovados
6. **Webhook oficial** — Configurar webhook no Meta Developer Dashboard para receber status de entrega e mensagens recebidas
7. **Atualizar Edge Functions** — `whatsapp-webhook` precisaria ser refatorado para o formato de payload do Meta (diferente do Evolution API)

## Recomendação

- **Para MVP/testes**: Evolution API funciona, mas com risco de instabilidade
- **Para produção com tráfego pago**: Migrar para a API oficial do Meta é **obrigatório**

### Plano de migração (se aprovado)

1. Criar `src/lib/meta-whatsapp-api.ts` — client para a Cloud API oficial
2. Criar Edge Function `meta-whatsapp-webhook` — receber eventos no formato Meta
3. Atualizar `useWhatsAppSender.ts` — alternar entre Evolution e Meta baseado na configuração da loja
4. Adicionar secrets: `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`
5. Atualizar UI de configuração para suportar ambos os modos

Deseja que eu implemente a migração para a API oficial do Meta?

