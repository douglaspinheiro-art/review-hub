# Multi-tenant audit operations runbook

Endpoints administrativos criados pela auditoria de integrações (Fase Final).
Apenas usuários com role `admin` (via `has_role`) conseguem ler estes dados.

## Auditoria de integrações

```sql
-- Lista integrações com problemas (sem store_id, sem credencial de webhook etc.)
SELECT * FROM public.list_integrations_audit()
WHERE audit_status <> 'ok';
```

Possíveis valores de `audit_status`:

- `missing_store_id` — registro não foi migrado pela Fase A. Backfill manual:
  ```sql
  UPDATE public.integrations i
     SET store_id = (SELECT id FROM public.stores WHERE user_id = i.user_id ORDER BY created_at LIMIT 1)
   WHERE store_id IS NULL;
  ```
- `missing_webhook_credential` — integração ativa sem secret/token. O webhook vai falhar com 401. Acionar a loja para reconectar.

## Auditoria de canais (`channels`)

```sql
SELECT * FROM public.list_channels_audit() WHERE audit_status <> 'ok';
```

`channels` é onde ficam Magento/Dizy/etc. Mesmas regras se aplicam.

## Erros de cliente (RLS denied, etc.)

```sql
SELECT route, message, count(*) AS occurrences, max(created_at) AS last_seen
  FROM public.client_error_events
 WHERE created_at > now() - interval '24 hours'
   AND (message ILIKE '%row-level security%' OR message ILIKE '%RLS%' OR message ILIKE '%permission denied%')
 GROUP BY route, message
 ORDER BY occurrences DESC;
```

Picos repentinos costumam indicar:

- Uma loja foi criada e o frontend está tentando ler tabelas antes do `StoreScopeContext` resolver a `effectiveUserId` correta.
- Algum hook está consultando uma tabela tenant-scoped sem `store_id` no filtro (exemplo do BUG-9 já corrigido).

## Webhooks rejeitados por motivo

Os logs do edge function `webhook-orders` registram o motivo da rejeição via `console.warn` com prefixo `webhook-rejected`. Filtrar via Supabase Dashboard → Functions → Logs com a query `webhook-rejected`.

Motivos esperados:

| Código | Significado |
|---|---|
| `hmac_invalid` | Assinatura HMAC não bate com o secret armazenado (Shopify, Woo, Tray, Yampi) |
| `token_invalid` | Token estático inválido (Nuvemshop, VTEX, Magento) |
| `no_integration` | Não há integração ativa para `(store_id, type)` — possível resíduo do BUG-1 |
| `type_mismatch` | Match estrito por `type` falhou — investigar `name` que possa ter alias errado |
