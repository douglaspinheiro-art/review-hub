
A conexão Meta Cloud está validada (status "Conectado"). Os próximos passos para testar a integração ponta-a-ponta:

## Passo 1 — Configurar webhook no painel da Meta (recebimento)
No Meta Developer Console → seu App → WhatsApp → Configuration → Webhook:
- **Callback URL**: `https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/meta-whatsapp-webhook`
- **Verify Token**: o valor do secret `META_WHATSAPP_VERIFY_TOKEN` no Supabase
- Clicar em **Verify and Save** → deve dar ✓
- Subscrever ao campo **messages**
- Em **Phone Numbers**, clicar em **Subscribe** no número `1003067482898885`

## Passo 2 — Adicionar número de teste como destinatário
A Meta exige que, em modo de desenvolvimento, números destinatários sejam pré-cadastrados:
- Painel Meta → WhatsApp → API Setup → **To** → Adicionar número (seu WhatsApp pessoal)
- Confirmar código recebido por SMS/WhatsApp

## Passo 3 — Enviar mensagem template de teste (saída)
Como a Meta só permite mensagens de texto livre dentro da janela de 24h após o cliente iniciar contato, o **primeiro envio precisa ser um template aprovado** (ex: `hello_world`):

Adicionar um botão **"Enviar template de teste"** no card da conexão que chama `meta-whatsapp-send` com:
```ts
{ kind: "sendTemplate", connectionId, number: "55XXXXXXXXX", 
  templateName: "hello_world", templateLanguage: "en_US" }
```

## Passo 4 — Testar recebimento (entrada)
Responder no WhatsApp pessoal. A mensagem deve:
1. Chegar no webhook `meta-whatsapp-webhook`
2. Ser persistida via `persistInboundWhatsAppMessage`
3. Aparecer em `/dashboard/inbox`

## Passo 5 — Testar envio livre (após inbound)
Com a janela de 24h aberta, testar `kind: "sendText"` com mensagem livre pela Inbox.

## Passo 6 — Verificações de saúde
- Logs da edge `meta-whatsapp-webhook` (deve mostrar payloads recebidos)
- Tabela `messages` no Supabase (registros inbound/outbound)
- Card da conexão deve continuar "Conectado" (sem cair para "degraded")

## Detalhes técnicos
- **O que vou alterar no código**: adicionar botão "Enviar template de teste" no card Meta Cloud em `src/pages/dashboard/WhatsApp.tsx`, com modal simples (número + template name + language) que chama `meta-whatsapp-send` via `supabase.functions.invoke`.
- **O que NÃO precisa mudar**: webhook, autenticação, persistência — já estão prontos.
- **Pré-requisito Meta**: template `hello_world` já vem aprovado por padrão em contas novas; se quiser template customizado, precisa criar e aguardar aprovação (~minutos).

## O que você precisa fazer manualmente (fora do código)
1. Configurar webhook no painel Meta (Passo 1)
2. Cadastrar seu número pessoal como destinatário de teste (Passo 2)
3. Me passar o número (formato 55DDDNNNNNNNNN) para preencher o teste — ou eu deixo o campo aberto
