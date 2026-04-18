

## Objetivo

Permitir disparo de campanhas WhatsApp via **Templates HSM aprovados pela Meta** (única forma de enviar fora da janela de 24h), em vez de texto livre que é silenciosamente descartado.

## Diagnóstico

O backend **já suporta templates** (`metaGraphSendTemplate` em `meta-graph-send.ts`, e `dispatch-campaign` já lê `blocks.whatsapp.meta_template_name`). Faltam 3 peças:

1. **UI no `CampaignModal`** — escolher template + idioma + variáveis
2. **Worker `process-scheduled-messages`** — quando a campanha tem template, chamar `sendTemplate` em vez de `sendText`
3. **Listagem de templates aprovados** — buscar da Meta Graph API (`/{waba_id}/message_templates`) para o usuário escolher na UI sem digitar à mão

## Plano de implementação

### 1. Nova edge function `meta-list-templates`
- Recebe `connectionId`, valida JWT do usuário
- Busca templates aprovados da Meta: `GET /{waba_id}/message_templates?status=APPROVED`
- Retorna lista com: `name`, `language`, `category`, `components` (para detectar quantas variáveis `{{1}}`, `{{2}}`... o body espera)
- Requer adicionar `meta_waba_id` em `whatsapp_connections` (provavelmente já existe; vou conferir e migrar se faltar)

### 2. Novo passo no `CampaignModal` (canal WhatsApp)
Adicionar **toggle "Tipo de envio"** no passo de conteúdo:
- **Template aprovado (recomendado)** — default; garante entrega
- **Texto livre (24h)** — só para conversas ativas; com aviso amarelo explicando a regra

Quando "Template" selecionado:
- Dropdown de templates aprovados (vindos da nova edge function)
- Auto-detecta nº de variáveis `{{1}}`...`{{N}}` do body
- Inputs dinâmicos para cada variável (com sugestões: `{{nome}}`, `{{cupom}}`)
- Idioma (default `pt_BR`, pré-preenchido do template)
- Preview renderizado com as variáveis substituídas

Quando "Texto livre" selecionado:
- Banner amarelo: "Esta mensagem só será entregue a contatos que conversaram com você nas últimas 24h. Para garantir entrega, use Templates aprovados."
- Mantém o textarea atual

### 3. Persistência em `campaigns.blocks`
Salvar no JSON `blocks`:
```json
{
  "whatsapp": {
    "content_type": "template" | "text",
    "meta_template_name": "carrinho_abandonado",
    "meta_template_language": "pt_BR",
    "meta_template_parameters": ["{{nome}}", "{{cupom}}"]
  }
}
```

### 4. Ajuste no worker `process-scheduled-messages`
Hoje o worker manda tudo como texto. Mudar para:
- Ler `campaign.blocks.whatsapp.content_type`
- Se `template`: substituir `{{nome}}` etc. pelos dados do contato e chamar `meta-whatsapp-send` com `kind: "sendTemplate"`
- Se `text`: comportamento atual (`sendText`)

### 5. Banner educativo na lista de campanhas
Card dispensável no topo de `/dashboard/campanhas`:
> "💡 Mensagens WhatsApp fora da janela de 24h só são entregues via Templates aprovados pela Meta. [Saiba mais →](link Meta Business)"

## Arquivos afetados

- **Novo:** `supabase/functions/meta-list-templates/index.ts`
- **Editar:** `src/components/dashboard/CampaignModal.tsx` (passo de conteúdo + toggle + dropdown)
- **Editar:** `src/components/dashboard/campaign/CampaignObjectiveStep.tsx` (se necessário, para indicar template)
- **Editar:** `supabase/functions/process-scheduled-messages/index.ts` (suporte a template)
- **Editar:** `src/pages/dashboard/Campanhas.tsx` (banner educativo)
- **Migração (se faltar):** garantir `meta_waba_id` em `whatsapp_connections`

## Resultado esperado

1. Ao criar campanha WhatsApp, usuário escolhe um template aprovado da sua conta Meta
2. Worker dispara via `sendTemplate` → Meta entrega 100% (não descarta como faz com texto livre fora da janela)
3. Mensagens chegam efetivamente no celular dos clientes, mesmo sem conversa prévia

## Pré-requisito do usuário (fora do código)

Você precisa criar e aprovar templates no **Meta Business Manager → WhatsApp Manager → Modelos de mensagem**. Exemplos típicos:
- `carrinho_abandonado` (categoria Marketing)
- `boas_vindas` (Utility)
- `promocao_geral` (Marketing)

Aprovação leva de minutos a 24h. Sem templates aprovados, o dropdown ficará vazio e a UI orientará a criar.

