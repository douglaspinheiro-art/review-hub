

# Remoção Completa da Evolution API

## Contexto
A Evolution API era o provedor legado de WhatsApp (QR Code). Agora todo envio usa Meta Cloud API. Os campos e referências à Evolution ainda existem no código e precisam ser limpos.

## Alterações

### 1. Código TypeScript (arquivos do app)

| Arquivo | Mudança |
|---------|---------|
| `src/lib/meta-whatsapp-client.ts` | Remover `evolution_api_url` e `evolution_api_key` do tipo `ConnRow` |
| `src/pages/dashboard/WhatsApp.tsx` | Remover as linhas `evolution_api_url: null` e `evolution_api_key: null` dos objetos de criação/atualização |
| `src/lib/whatsapp/__tests__/connection-ui.test.ts` | Remover testes com `provider: "evolution"` e atualizar descrições |
| `src/hooks/useWhatsAppSender.ts` | Nenhuma mudança necessaria (já não referencia Evolution) |

### 2. Edge Functions

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/meta-wa-oauth/index.ts` | Remover `evolution_api_url: null` e `evolution_api_key: null` do upsert |
| `supabase/functions/_shared/whatsapp-inbound-persist.ts` | Atualizar comentário "Evolution ou Meta" para apenas "Meta" |

### 3. Documentação

| Arquivo | Mudança |
|---------|---------|
| `README.md` | Trocar "WhatsApp: Evolution API" por "WhatsApp: Meta Cloud API" |
| `GEMINI.md` | Trocar "Evolution API" por "Meta Cloud API" |
| `PLAYBOOK.md` | Remover referências à Evolution API e QR Code; atualizar para Meta Cloud |
| `docs/meta-whatsapp-cloud-setup.md` | Remover "(sem Evolution)" do texto |

### 4. SQL / Migrações
- **Não remover colunas do banco** (`evolution_api_url`, `evolution_api_key`, `api_provider`) — isso requer migração destrutiva e pode quebrar dados existentes. As colunas ficam no DB mas o código não as usa mais.
- `supabase/schema.sql` — Remover `evolution_api_url` e `evolution_api_key` da definição da tabela `whatsapp_connections` (schema de referência)
- `src/integrations/supabase/types.ts` — Não editar manualmente (gerado automaticamente pelo Supabase CLI)

### 5. Memória
- Atualizar `mem://features/whatsapp-integration` para refletir que Evolution foi removida

## Arquivos que NÃO serão alterados
- `src/integrations/supabase/types.ts` — gerado automaticamente
- Migrações existentes em `supabase/migrations/` — histórico imutável
- `supabase/full-migration.sql`, `supabase/phase1-migration.sql` — scripts legados de referência

