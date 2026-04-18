

O erro é claro: o scope `business_management` não está permitido para o seu app Meta como está configurado hoje. Esse scope precisa de **App Review** aprovado pela Meta — sem isso, ele é rejeitado.

## Por que acontece

No `src/lib/whatsapp/meta-embedded-signup.ts` (linha ~93) pedimos:
```
scope: "whatsapp_business_messaging,whatsapp_business_management,business_management"
```

`business_management` exige:
- App em modo **Live**
- **Advanced Access** aprovado para esse permission (App Review submission)
- Business Verification concluída

Como o app ainda não tem isso aprovado, a Meta bloqueia o popup com "Invalid Scopes".

A boa notícia: para Embedded Signup do WhatsApp **`business_management` é opcional**. Os scopes mínimos obrigatórios são apenas:
- `whatsapp_business_messaging`
- `whatsapp_business_management`

Esses dois já vêm com **Standard Access** automaticamente quando o produto WhatsApp Business é adicionado ao app — não precisam de App Review para o próprio dono testar.

## Correção (1 arquivo)

**`src/lib/whatsapp/meta-embedded-signup.ts`** — remover `business_management` do scope:

```ts
scope: "whatsapp_business_messaging,whatsapp_business_management"
```

Resultado: popup abre normalmente, fluxo Embedded Signup completo continua funcionando (descoberta de WABA, phone_number_id, webhook subscribe — tudo isso usa `whatsapp_business_management`, que é suficiente).

## O que NÃO muda

- `supabase/functions/meta-wa-oauth/index.ts` — não precisa tocar (já funciona com 2 scopes)
- Configuration do Embedded Signup no Meta Dashboard — manter as 2 permissões obrigatórias; pode remover `business_management` de lá também se estiver listada
- Nenhuma migração de banco

## Quando voltar a precisar de `business_management`

Só se quiser listar/gerenciar **múltiplos Business Managers** do lojista além do que vem no token. Para o caso de uso "conectar 1 WABA → enviar mensagens", os 2 scopes bastam. Se um dia precisar, faz App Review separadamente.

## Checklist pós-fix

1. Aplicar a mudança no arquivo
2. Recarregar `/dashboard/whatsapp` e clicar "Conectar com Facebook"
3. Popup deve abrir pedindo só "WhatsApp Business Messaging" e "WhatsApp Business Management"
4. Concluir fluxo → linha em `whatsapp_connections` com `provider='meta_cloud'`

