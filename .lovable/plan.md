
## Diagnóstico

A campanha foi enfileirada com sucesso (5 mensagens em `scheduled_messages` com `status='pending'`), mas **ninguém processa a fila**:

- Existe a edge function `process-scheduled-messages` (worker que pega `pending` → chama Meta Cloud → marca `sent`).
- **Não existe nenhum cron job** chamando essa função (verificado em `cron.job` — só há `archive-scheduled-messages` rodando).
- Resultado: mensagens ficam em `pending` indefinidamente, campanha trava em `running`.

## Correção

**1. Criar cron job no Postgres** (a cada 1 min) que chama `process-scheduled-messages` via `pg_net`, autenticando com o secret `PROCESS_SCHEDULED_MESSAGES_SECRET` (header `Authorization: Bearer <secret>`).

```sql
select cron.schedule(
  'process-scheduled-messages-every-minute',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/process-scheduled-messages',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'Authorization','Bearer <PROCESS_SCHEDULED_MESSAGES_SECRET>'
       ),
       body := '{}'::jsonb
     ); $$
);
```

Pré-requisitos: extensões `pg_cron` e `pg_net` habilitadas (verifico na execução; se faltar, habilito na mesma migração).

**2. Verificar se o secret `PROCESS_SCHEDULED_MESSAGES_SECRET` existe.** Se não existir, peço para você adicionar antes de aplicar o cron (não consigo gerar/persistir secrets pelo SQL).

**3. Disparo manual imediato (one-off)** para esvaziar as 5 mensagens já enfileiradas e validar Meta Cloud ponta-a-ponta — chamando `process-scheduled-messages` uma vez via `curl_edge_functions`.

## O que NÃO muda

- Função `dispatch-campaign` e RPC de segmentação (já corrigidas e funcionando).
- `process-scheduled-messages` (já implementado, só falta agendamento).
- Conexão Meta Cloud / templates.

## Resultado esperado

- Worker roda a cada minuto, consome `pending`, envia via Meta Graph, atualiza `sent_at` + `status='sent'`.
- A campanha "Teste" sai de `running` para `completed` quando todas as 5 forem processadas.
- Você recebe a mensagem no WhatsApp do número cadastrado em `customers_v3` (lembrando: precisa estar em janela de 24h **ou** ser template aprovado — caso contrário a Meta retorna erro e o campo `error_message` será preenchido).

<lov-actions>
<lov-suggestion message="Aplicar a correção: verificar/habilitar pg_cron + pg_net, validar o secret PROCESS_SCHEDULED_MESSAGES_SECRET, criar o cron de 1 em 1 minuto e disparar o worker manualmente para enviar as 5 mensagens já enfileiradas.">Aplicar correção e processar a fila agora</lov-suggestion>
<lov-suggestion message="Depois que o worker rodar, conferir no WhatsApp se a mensagem chegou e me dizer se status no dashboard mudou para 'completed'.">Confirmar recebimento ponta-a-ponta</lov-suggestion>
<lov-suggestion message="Adicionar uma coluna na lista de campanhas mostrando progresso (enviadas / total) com auto-refresh a cada 10s enquanto status='running'.">Mostrar progresso em tempo real</lov-suggestion>
</lov-actions><lov-plan>

## Diagnóstico

A campanha foi enfileirada com sucesso (5 mensagens em `scheduled_messages` com `status='pending'`), mas **ninguém processa a fila**:

- A edge function `process-scheduled-messages` existe (worker que pega `pending` → chama Meta Cloud → marca `sent`).
- **Não há cron job configurado** chamando essa função (verifiquei `cron.job` — só roda `archive-scheduled-messages`).
- Resultado: mensagens ficam em `pending` indefinidamente, campanha trava em `running`.

## Correção

**1. Criar cron no Postgres** (a cada 1 min) chamando `process-scheduled-messages` via `pg_net`, com header `Authorization: Bearer <PROCESS_SCHEDULED_MESSAGES_SECRET>`.

```sql
select cron.schedule(
  'process-scheduled-messages-every-minute',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://ydkglitowqlpizpnnofy.supabase.co/functions/v1/process-scheduled-messages',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'Authorization','Bearer <SECRET>'
       ),
       body := '{}'::jsonb
     ); $$
);
```

Pré-requisitos: extensões `pg_cron` e `pg_net` habilitadas (habilito na mesma migração se faltar).

**2. Verificar o secret `PROCESS_SCHEDULED_MESSAGES_SECRET`.** Se não existir, peço para você adicionar antes de aplicar o cron.

**3. Disparo manual imediato** para esvaziar as 5 mensagens já enfileiradas e validar Meta Cloud ponta-a-ponta — uma chamada one-off em `process-scheduled-messages`.

## O que NÃO muda

- `dispatch-campaign` e RPC de segmentação (já corrigidas).
- `process-scheduled-messages` (código pronto, só falta agendamento).
- Conexão Meta Cloud / templates.

## Resultado esperado

- Worker roda a cada minuto, consome `pending`, envia via Meta Graph, marca `sent_at` + `status='sent'`.
- A campanha "Teste" passa de `running` → `completed` após processar as 5.
- Mensagem chega no WhatsApp do número em `customers_v3` (desde que esteja em janela de 24h **ou** seja template aprovado; caso contrário a Meta retorna erro e o campo `error_message` é preenchido).

